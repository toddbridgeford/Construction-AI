const DEFAULT_NOTION_DATABASE_ID = "312f63a1aa6f80af91d7c019f1f2b53d";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return corsPreflight();

    try {
      const path = url.pathname.replace(/\/+$/, "") || "/";

      if (path === "/" || path === "/health") {
        return json({ ok: true, service: "construction-ai-terminal" });
      }

      if (path === "/notion/series" && request.method === "GET") {
        ensureSecrets(env, ["NOTION_TOKEN"]);
        const series = await getSeriesIdsFromNotionCached(env, ctx);
        return json({ count: series.length, series }, 200, cacheControl(ttl(env)));
      }

      if (path === "/notion/add" && request.method === "POST") {
        ensureSecrets(env, ["NOTION_TOKEN"]);
        const body = await safeJsonBody(request);
        if (!body?.properties || typeof body.properties !== "object") {
          return jsonError(400, "invalid_request", "Body must include a Notion 'properties' object.");
        }
        const created = await notionCreatePage(env, body.properties, body.children);
        return json(created);
      }

      if (path === "/fred/observations" && request.method === "GET") {
        ensureSecrets(env, ["FRED_API_KEY"]);
        const seriesId = mustParam(url, "series_id");
        const upstream = new URL("https://api.stlouisfed.org/fred/series/observations");
        upstream.searchParams.set("series_id", seriesId);
        upstream.searchParams.set("api_key", env.FRED_API_KEY);
        upstream.searchParams.set("file_type", "json");

        const passthrough = ["limit", "sort_order", "observation_start", "observation_end", "units", "frequency", "aggregation_method", "output_type", "offset"];
        for (const key of passthrough) {
          const value = url.searchParams.get(key);
          if (value) upstream.searchParams.set(key, value);
        }

        const payload = await fetchJSONWithCache(upstream.toString(), env, ctx);
        return json(payload, 200, cacheControl(ttl(env)));
      }

      if (path === "/bundle" && request.method === "GET") {
        ensureSecrets(env, ["FRED_API_KEY", "NOTION_TOKEN"]);
        const limit = clampInt(url.searchParams.get("limit") ?? "60", 1, 5000);
        const overrideSeries = (url.searchParams.get("fred") ?? "")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean);

        const seriesIds = overrideSeries.length > 0 ? uniqueSorted(overrideSeries) : await getSeriesIdsFromNotionCached(env, ctx);
        const fred = {};

        await mapWithConcurrency(seriesIds, 6, async (seriesId) => {
          const upstream = new URL("https://api.stlouisfed.org/fred/series/observations");
          upstream.searchParams.set("series_id", seriesId);
          upstream.searchParams.set("api_key", env.FRED_API_KEY);
          upstream.searchParams.set("file_type", "json");
          upstream.searchParams.set("limit", String(limit));
          upstream.searchParams.set("sort_order", "desc");
          fred[seriesId] = await fetchJSONWithCache(upstream.toString(), env, ctx);
        });

        return json({
          meta: { used_override: overrideSeries.length > 0, series_count: seriesIds.length },
          fred,
        }, 200, cacheControl(ttl(env)));
      }

      if (path === "/stooq/quote" && request.method === "GET") {
        const symbol = mustParam(url, "s");
        const upstream = new URL("https://stooq.com/q/l/");
        upstream.searchParams.set("s", symbol);
        upstream.searchParams.set("f", "sd2t2ohlcvn");
        upstream.searchParams.set("h", "");
        upstream.searchParams.set("e", "json");

        const payload = await fetchPossiblyJsonWithCache(upstream.toString(), env, ctx);
        return json(payload, 200, cacheControl(ttl(env)));
      }

      if (path === "/bls/timeseries" && request.method === "POST") {
        const body = await safeJsonBody(request);
        if (!Array.isArray(body?.seriesid) || body.seriesid.length === 0) {
          return jsonError(400, "invalid_request", "Body must include non-empty seriesid array.");
        }

        const payload = {
          seriesid: body.seriesid,
          startyear: body.startyear,
          endyear: body.endyear,
          catalog: body.catalog,
          calculations: body.calculations,
          annualaverage: body.annualaverage,
        };
        if (env.BLS_API_KEY) payload.registrationKey = env.BLS_API_KEY;

        const result = await fetchJSONPostWithCache(
          "https://api.bls.gov/publicAPI/v2/timeseries/data/",
          payload,
          env,
          ctx,
        );
        return json(result, 200, cacheControl(ttl(env)));
      }

      if (path === "/usaspending/awards" && request.method === "POST") {
        const body = await safeJsonBody(request);
        const result = await fetchJSONPostWithCache(
          "https://api.usaspending.gov/api/v2/search/spending_by_award/",
          body,
          env,
          ctx,
        );
        return json(result, 200, cacheControl(ttl(env)));
      }

      if (path === "/usaspending/awards/count" && request.method === "POST") {
        const body = await safeJsonBody(request);
        const result = await fetchJSONPostWithCache(
          "https://api.usaspending.gov/api/v2/search/spending_by_award_count/",
          body,
          env,
          ctx,
        );
        return json(result, 200, cacheControl(ttl(env)));
      }

      if (path === "/alphavantage/quote" && request.method === "GET") {
        ensureSecrets(env, ["ALPHAVANTAGE_API_KEY"]);
        const symbol = mustParam(url, "symbol");
        return proxyAlphaVantage(env, ctx, {
          function: "GLOBAL_QUOTE",
          symbol,
        }, false);
      }

      if (path === "/alphavantage/daily" && request.method === "GET") {
        ensureSecrets(env, ["ALPHAVANTAGE_API_KEY"]);
        const symbol = mustParam(url, "symbol");
        const outputsize = allowValue(url.searchParams.get("outputsize") ?? "compact", ["compact", "full"]);
        const datatype = allowValue(url.searchParams.get("datatype") ?? "json", ["json", "csv"]);
        return proxyAlphaVantage(env, ctx, {
          function: "TIME_SERIES_DAILY",
          symbol,
          outputsize,
          datatype,
        }, datatype === "csv");
      }

      if (path === "/alphavantage/intraday" && request.method === "GET") {
        ensureSecrets(env, ["ALPHAVANTAGE_API_KEY"]);
        const symbol = mustParam(url, "symbol");
        const interval = allowValue(url.searchParams.get("interval") ?? "5min", ["1min", "5min", "15min", "30min", "60min"]);
        const outputsize = allowValue(url.searchParams.get("outputsize") ?? "compact", ["compact", "full"]);
        const datatype = allowValue(url.searchParams.get("datatype") ?? "json", ["json", "csv"]);

        const params = {
          function: "TIME_SERIES_INTRADAY",
          symbol,
          interval,
          outputsize,
          datatype,
        };

        const adjusted = url.searchParams.get("adjusted");
        if (adjusted) params.adjusted = allowValue(adjusted, ["true", "false"]);
        const extendedHours = url.searchParams.get("extended_hours");
        if (extendedHours) params.extended_hours = allowValue(extendedHours, ["true", "false"]);
        const month = url.searchParams.get("month");
        if (month) params.month = month;

        return proxyAlphaVantage(env, ctx, params, datatype === "csv");
      }

      if (path === "/alphavantage/news" && request.method === "GET") {
        ensureSecrets(env, ["ALPHAVANTAGE_API_KEY"]);
        const params = { function: "NEWS_SENTIMENT" };
        const safe = ["tickers", "topics", "time_from", "time_to", "limit", "sort"];
        for (const key of safe) {
          const value = url.searchParams.get(key);
          if (value) params[key] = value;
        }
        return proxyAlphaVantage(env, ctx, params, false);
      }

      if (path === "/news/feeds" && request.method === "GET") {
        const mode = allowValue(url.searchParams.get("mode") ?? "fetch", ["list", "fetch"]);
        const feeds = parseCommaList(env.NEWS_FEEDS);
        if (mode === "list") return json({ count: feeds.length, feeds });

        const results = [];
        await mapWithConcurrency(feeds, 4, async (feedUrl) => {
          try {
            const text = await fetchTextWithCache(feedUrl, env, ctx);
            const status = 200;
            results.push({
              url: feedUrl,
              ok: true,
              status,
              content_type: sniffContentType(text),
              text_truncated: text.slice(0, 4000),
            });
          } catch (error) {
            results.push({
              url: feedUrl,
              ok: false,
              status: 502,
              content_type: null,
              text_truncated: String(error?.message ?? error).slice(0, 4000),
            });
          }
        });

        return json({ count: results.length, results }, 200, cacheControl(ttl(env)));
      }

      return jsonError(404, "not_found", `No route for ${path}`);
    } catch (error) {
      if (error instanceof HttpError) {
        return jsonError(error.status, error.error, error.message, error.headers);
      }
      return jsonError(500, "internal_error", String(error?.message ?? error));
    }
  },
};

class HttpError extends Error {
  constructor(status, error, message, headers = {}) {
    super(message);
    this.status = status;
    this.error = error;
    this.headers = headers;
  }
}

function json(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(),
      ...extraHeaders,
    },
  });
}

function jsonError(status, error, message, headers = {}) {
  return json({ error, message }, status, headers);
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function corsPreflight() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

function mustParam(url, key) {
  const value = url.searchParams.get(key);
  if (!value) throw new HttpError(400, "invalid_request", `Missing required query parameter '${key}'.`);
  return value;
}

function clampInt(value, min, max) {
  const n = Number.parseInt(String(value), 10);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function ttl(env) {
  const value = Number(env.CACHE_TTL_SECONDS ?? 300);
  if (!Number.isFinite(value)) return 300;
  return Math.max(1, Math.min(3600, Math.trunc(value)));
}

function cacheControl(seconds) {
  return { "Cache-Control": `public, max-age=${seconds}` };
}

function notionDatabaseId(env) {
  return env.NOTION_DATABASE_ID || DEFAULT_NOTION_DATABASE_ID;
}

function ensureSecrets(env, names) {
  for (const name of names) {
    if (!env[name]) throw new HttpError(500, "missing_secret", `Missing required secret: ${name}`);
  }
}

function allowValue(value, allowed) {
  if (allowed.includes(value)) return value;
  throw new HttpError(400, "invalid_request", `Invalid value '${value}'. Allowed: ${allowed.join(", ")}`);
}

function parseCommaList(input) {
  return String(input || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

async function safeJsonBody(request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must be valid JSON.");
  }
}

async function getSeriesIdsFromNotionCached(env, ctx) {
  const cacheKey = "https://cache.local/notion-series";
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached.json();

  const series = await getSeriesIdsFromNotion(env);
  const response = new Response(JSON.stringify(series), {
    headers: {
      "Content-Type": "application/json",
      ...cacheControl(ttl(env)),
    },
  });
  ctx.waitUntil(cache.put(cacheKey, response));
  return series;
}

async function getSeriesIdsFromNotion(env) {
  const dbId = notionDatabaseId(env);
  const seriesSet = new Set();
  let startCursor;

  while (true) {
    const payload = {
      page_size: 100,
      filter: {
        property: "Series ID",
        select: { is_not_empty: true },
      },
      ...(startCursor ? { start_cursor: startCursor } : {}),
    };

    const response = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: "POST",
      headers: notionHeaders(env),
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    if (!response.ok) {
      throw new HttpError(502, "upstream_error", `Notion query failed (${response.status}): ${text.slice(0, 300)}`);
    }

    const data = safeParseJson(text);
    for (const row of data?.results || []) {
      const selected = row?.properties?.["Series ID"]?.select?.name;
      if (selected && typeof selected === "string") seriesSet.add(selected.trim());
    }

    if (data?.has_more && data?.next_cursor) {
      startCursor = data.next_cursor;
      continue;
    }
    break;
  }

  return uniqueSorted([...seriesSet]);
}

async function notionCreatePage(env, properties, children) {
  const body = {
    parent: { database_id: notionDatabaseId(env) },
    properties,
  };
  if (Array.isArray(children)) body.children = children;

  const response = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: notionHeaders(env),
    body: JSON.stringify(body),
  });

  const text = await response.text();
  const parsed = safeParseJson(text);
  if (!response.ok) {
    throw new HttpError(502, "upstream_error", `Notion page create failed (${response.status}): ${text.slice(0, 300)}`);
  }
  return parsed;
}

function notionHeaders(env) {
  return {
    Authorization: `Bearer ${env.NOTION_TOKEN}`,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
  };
}

async function fetchJSONWithCache(url, env, ctx) {
  const cacheKey = new Request(url, { method: "GET" });
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached.json();

  const response = await fetch(url);
  const text = await response.text();
  if (!response.ok) {
    throw new HttpError(502, "upstream_error", `Upstream GET failed (${response.status}): ${text.slice(0, 300)}`);
  }

  const parsed = safeParseJson(text);
  const toCache = new Response(JSON.stringify(parsed), {
    headers: { "Content-Type": "application/json", ...cacheControl(ttl(env)) },
  });
  ctx.waitUntil(cache.put(cacheKey, toCache));
  return parsed;
}

async function fetchPossiblyJsonWithCache(url, env, ctx) {
  const cacheKey = new Request(url, { method: "GET" });
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached.json();

  const response = await fetch(url);
  const text = await response.text();
  if (!response.ok) {
    throw new HttpError(502, "upstream_error", `Upstream GET failed (${response.status}): ${text.slice(0, 300)}`);
  }

  const parsed = safeParseJson(text);
  const toCache = new Response(JSON.stringify(parsed), {
    headers: { "Content-Type": "application/json", ...cacheControl(ttl(env)) },
  });
  ctx.waitUntil(cache.put(cacheKey, toCache));
  return parsed;
}

async function fetchJSONPostWithCache(url, body, env, ctx) {
  const stable = stableStringify(body ?? {});
  const hash = await sha256(stable);
  const cacheKey = new Request(`https://cache.local/post/${hash}?u=${encodeURIComponent(url)}`, { method: "GET" });
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached.json();

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: stable,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new HttpError(502, "upstream_error", `Upstream POST failed (${response.status}): ${text.slice(0, 300)}`);
  }

  const parsed = safeParseJson(text);
  const toCache = new Response(JSON.stringify(parsed), {
    headers: { "Content-Type": "application/json", ...cacheControl(ttl(env)) },
  });
  ctx.waitUntil(cache.put(cacheKey, toCache));
  return parsed;
}

async function fetchTextWithCache(url, env, ctx) {
  const cacheKey = new Request(url, { method: "GET" });
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached.text();

  const response = await fetch(url);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Feed fetch failed (${response.status})`);
  }

  const toCache = new Response(text, {
    headers: { "Content-Type": response.headers.get("content-type") || "text/plain", ...cacheControl(ttl(env)) },
  });
  ctx.waitUntil(cache.put(cacheKey, toCache));
  return text;
}

async function proxyAlphaVantage(env, ctx, params, wantsCsv) {
  const upstream = new URL("https://www.alphavantage.co/query");
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) upstream.searchParams.set(key, String(value));
  }
  upstream.searchParams.set("apikey", env.ALPHAVANTAGE_API_KEY);

  const cache = caches.default;
  const cacheKey = new Request(upstream.toString(), { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const response = await fetch(upstream.toString());
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();

  if (!response.ok) {
    return jsonError(502, "upstream_error", `Alpha Vantage error (${response.status})`);
  }

  if (!wantsCsv || contentType.includes("json") || text.trim().startsWith("{")) {
    const parsed = safeParseJson(text);
    if (parsed?.Note || parsed?.["Error Message"]) {
      return json(
        { warning: "Alpha Vantage rate limited or returned an error.", upstream: parsed },
        429,
        { "Cache-Control": "no-store" },
      );
    }

    const toCache = new Response(JSON.stringify(parsed), {
      headers: { "Content-Type": "application/json", ...cacheControl(alphaTtl(env)) },
    });
    ctx.waitUntil(cache.put(cacheKey, toCache));
    return toCache;
  }

  const toCache = new Response(text, {
    headers: { "Content-Type": "text/csv; charset=utf-8", ...cacheControl(alphaTtl(env)) },
  });
  ctx.waitUntil(cache.put(cacheKey, toCache));
  return toCache;
}

function alphaTtl(env) {
  return Math.max(ttl(env), 900);
}

function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function sniffContentType(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith("<?xml") || trimmed.includes("<rss") || trimmed.includes("<feed")) return "application/xml";
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return "application/json";
  return "text/plain";
}

async function sha256(input) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const queue = [...items];
  const workers = new Array(Math.min(concurrency, queue.length)).fill(0).map(async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item !== undefined) await mapper(item);
    }
  });
  await Promise.all(workers);
}
