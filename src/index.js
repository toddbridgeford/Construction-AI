const SERVICE = "construction-ai-terminal";
const DEFAULT_GIT_SHA = "unknown";
const NOTION_VERSION = "2022-06-28";
const FRED_OBSERVATIONS_URL = "https://api.stlouisfed.org/fred/series/observations";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-admin-token",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    try {
      if (request.method !== "GET") {
        return json({ error: "method_not_allowed", message: "Only GET and OPTIONS are supported." }, 405);
      }

      if (path === "/") {
        return json({
          ok: true,
          service: SERVICE,
          endpoints: ["/health", "/notion/series", "/fred/observations", "/bundle", "/cpi"],
          generated_at_utc: new Date().toISOString(),
        });
      }

      if (path === "/health") {
        return json({ ok: true, service: SERVICE });
      }

      if (path === "/version") {
        return json({
          ok: true,
          worker: SERVICE,
          git_sha: String(env.GIT_SHA || DEFAULT_GIT_SHA),
          generated_at: new Date().toISOString(),
        });
      }

      if (path === "/notion/series") {
        const notionSeries = await getNotionFredSeries(env);
        if (notionSeries.errorResponse) return notionSeries.errorResponse;

        return json({
          count: notionSeries.series.length,
          series: notionSeries.series,
          generated_at_utc: new Date().toISOString(),
        });
      }

      if (path === "/fred/observations") {
        const missing = missingEnv(env, ["FRED_API_KEY"]);
        if (missing.length) return missingEnvResponse(missing);

        const seriesId = url.searchParams.get("series_id");
        if (!seriesId) {
          return json({ error: "missing_series_id", message: "Query parameter 'series_id' is required." }, 400);
        }

        const fredResponse = await fetchFredObservations(seriesId, url.searchParams, env);
        return fredResponse.errorResponse || json(fredResponse.payload);
      }

      if (path === "/bundle") {
        const missing = missingEnv(env, ["NOTION_TOKEN", "NOTION_DATABASE_ID", "FRED_API_KEY"]);
        if (missing.length) return missingEnvResponse(missing);

        const notionSeries = await getNotionFredSeries(env);
        if (notionSeries.errorResponse) return notionSeries.errorResponse;

        const limit = sanitizeLimit(url.searchParams.get("limit"));
        const sortOrder = sanitizeSortOrder(url.searchParams.get("sort_order"));
        const observationStart = sanitizeDate(url.searchParams.get("observation_start"));
        const observationEnd = sanitizeDate(url.searchParams.get("observation_end"));

        const fred = {};
        const params = {
          limit,
          sortOrder,
          observationStart,
          observationEnd,
        };

        await runWithConcurrency(notionSeries.series, 7, async (seriesId) => {
          const fredResult = await fetchFredObservations(seriesId, null, env, params);
          fred[seriesId] = fredResult.errorResponse
            ? await responseToJson(fredResult.errorResponse)
            : fredResult.payload;
        });

        return json({
          meta: {
            series_count: notionSeries.series.length,
            limit,
            generated_at_utc: new Date().toISOString(),
          },
          fred,
        });
      }

      if (path === "/cpi") {
        const missing = missingEnv(env, ["NOTION_TOKEN", "NOTION_DATABASE_ID", "FRED_API_KEY"]);
        if (missing.length) return missingEnvResponse(missing);

        const limit = sanitizeLimit(url.searchParams.get("limit") || "120");
        const notionSeries = await getNotionFredSeries(env);
        if (notionSeries.errorResponse) return notionSeries.errorResponse;

        const fredPayloads = [];
        await runWithConcurrency(notionSeries.series, 7, async (seriesId) => {
          const fredResult = await fetchFredObservations(seriesId, null, env, { limit, sortOrder: "desc" });
          if (!fredResult.errorResponse && Array.isArray(fredResult.payload?.observations)) {
            fredPayloads.push({ seriesId, payload: fredResult.payload });
          }
        });

        const cpi = computeCpi(fredPayloads);
        return json({
          ...cpi,
          generated_at_utc: new Date().toISOString(),
        });
      }

      return json({ error: "not_found", path }, 404);
    } catch (error) {
      return json({ error: "internal_error", message: String(error?.message || error) }, 500);
    }
  },
};

async function getNotionFredSeries(env) {
  const missing = missingEnv(env, ["NOTION_TOKEN", "NOTION_DATABASE_ID"]);
  if (missing.length) return { errorResponse: missingEnvResponse(missing) };

  const seriesSet = new Set();
  let startCursor = undefined;

  while (true) {
    const body = {
      filter: {
        property: "Source",
        select: { equals: "FRED" },
      },
      page_size: 100,
      ...(startCursor ? { start_cursor: startCursor } : {}),
    };

    const response = await fetch(`https://api.notion.com/v1/databases/${env.NOTION_DATABASE_ID}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.NOTION_TOKEN}`,
        "Content-Type": "application/json",
        "Notion-Version": NOTION_VERSION,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      if (response.status === 401) {
        return { errorResponse: json({ error: "notion_unauthorized", hint: "Check NOTION_TOKEN (Internal Integration Token)." }, 401) };
      }
      if (response.status === 403) {
        return { errorResponse: json({ error: "notion_forbidden", hint: "Share DB with integration via Connections in Notion." }, 403) };
      }
      const text = await response.text();
      return { errorResponse: json({ error: "notion_query_failed", status: response.status, body: text }, 500) };
    }

    const payload = await response.json();
    for (const row of payload.results || []) {
      const seriesId = row?.properties?.["Series ID"]?.select?.name;
      if (typeof seriesId === "string" && seriesId.trim()) {
        seriesSet.add(seriesId.trim());
      }
    }

    if (!payload.has_more) break;
    startCursor = payload.next_cursor;
  }

  const series = [...seriesSet].sort((a, b) => a.localeCompare(b));
  return { series };
}

async function fetchFredObservations(seriesId, urlParams, env, fixedParams = null) {
  const params = new URLSearchParams();

  const source = fixedParams || {
    limit: sanitizeLimit(urlParams?.get("limit")),
    sortOrder: sanitizeSortOrder(urlParams?.get("sort_order")),
    observationStart: sanitizeDate(urlParams?.get("observation_start")),
    observationEnd: sanitizeDate(urlParams?.get("observation_end")),
  };

  params.set("series_id", seriesId);
  params.set("api_key", env.FRED_API_KEY);
  params.set("file_type", "json");
  params.set("limit", String(source.limit ?? 100));
  params.set("sort_order", source.sortOrder || "desc");
  if (source.observationStart) params.set("observation_start", source.observationStart);
  if (source.observationEnd) params.set("observation_end", source.observationEnd);

  const response = await fetch(`${FRED_OBSERVATIONS_URL}?${params.toString()}`);
  if (!response.ok) {
    const message = await response.text();
    return { errorResponse: json({ error: "fred_failed", status: response.status, message }, response.status) };
  }

  return { payload: await response.json() };
}

function computeCpi(entries) {
  const scores = [];
  const latestYoys = [];
  const lagYoys = [];

  for (const entry of entries) {
    const series = normalizeSeries(entry.payload?.observations);
    if (series.length < 13) continue;

    const latest = series[series.length - 1].value;
    const yearAgo = series[series.length - 13].value;
    if (!isFiniteNumber(latest) || !isFiniteNumber(yearAgo) || yearAgo === 0) continue;

    const latestYoy = ((latest - yearAgo) / Math.abs(yearAgo)) * 100;
    const score = clamp(50 + 50 * Math.tanh(latestYoy / 10), 0, 100);
    scores.push(score);
    latestYoys.push(latestYoy);

    if (series.length >= 16) {
      const v3 = series[series.length - 4].value;
      const v15 = series[series.length - 16].value;
      if (isFiniteNumber(v3) && isFiniteNumber(v15) && v15 !== 0) {
        lagYoys.push(((v3 - v15) / Math.abs(v15)) * 100);
      }
    }
  }

  if (!scores.length) {
    return { headline_cpi: null, zone: "Unknown", delta_3m: null, series_used: 0 };
  }

  const headline = average(scores);
  const delta_3m = lagYoys.length ? average(latestYoys) - average(lagYoys) : null;

  return {
    headline_cpi: round(headline, 2),
    zone: zoneForScore(headline),
    delta_3m: delta_3m === null ? null : round(delta_3m, 4),
    series_used: scores.length,
  };
}

function normalizeSeries(observations) {
  if (!Array.isArray(observations)) return [];

  return observations
    .map((row) => {
      const value = Number.parseFloat(row?.value);
      return {
        date: row?.date,
        value,
      };
    })
    .filter((row) => isFiniteNumber(row.value) && row.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function sanitizeLimit(raw) {
  const parsed = Number.parseInt(raw ?? "100", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 100;
  return Math.min(parsed, 5000);
}

function sanitizeSortOrder(raw) {
  return raw === "asc" || raw === "desc" ? raw : "desc";
}

function sanitizeDate(raw) {
  if (!raw) return undefined;
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : undefined;
}

function zoneForScore(score) {
  if (!isFiniteNumber(score)) return "Unknown";
  if (score < 40) return "Stress";
  if (score < 60) return "Slowdown";
  if (score < 75) return "Watch";
  return "Expansion";
}

function missingEnv(env, names) {
  return names.filter((key) => !env[key]);
}

function missingEnvResponse(missing) {
  return json({
    error: "missing_env",
    missing,
    hint: "Set Worker Variables/Secrets in Cloudflare.",
  }, 500);
}

async function responseToJson(response) {
  try {
    const text = await response.text();
    return JSON.parse(text);
  } catch {
    return { error: "unknown_error" };
  }
}

async function runWithConcurrency(items, concurrency, task) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      if (item !== undefined) {
        await task(item);
      }
    }
  });
  await Promise.all(workers);
}

function average(values) {
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function round(value, precision) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function isFiniteNumber(value) {
  return Number.isFinite(value);
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS_HEADERS,
    },
  });
}
