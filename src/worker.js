/**
 * Production-ready Cloudflare Worker API
 *
 * Routes:
 *   GET  /health
 *   GET  /notion/series
 *   GET  /fred/observations?series_id=CPIAUCSL&limit=24
 *   GET  /cpi
 *   GET  /bundle
 *
 * Cron:
 *   hourly -> refresh CPI snapshot into KV key "cpi:latest"
 *
 * Required env vars:
 *   FRED_API_KEY
 *
 * Optional env vars:
 *   NOTION_TOKEN
 *   NOTION_DATABASE_ID
 *   SERVICE_NAME
 *   GIT_SHA
 *
 * KV binding:
 *   CPI_SNAPSHOTS
 */

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,OPTIONS",
  "access-control-allow-headers": "content-type,authorization",
  "access-control-max-age": "86400",
};

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { ...JSON_HEADERS, ...CORS_HEADERS, ...extraHeaders },
  });
}

function badRequest(message, details) {
  return json({ ok: false, error: message, details }, 400);
}

function serverError(message, details) {
  return json({ ok: false, error: message, details }, 500);
}

function isString(x) {
  return typeof x === "string" && x.length > 0;
}

function nowIso() {
  return new Date().toISOString();
}

async function fetchJson(url, init = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const text = await res.text();
    let parsed;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = { raw: text };
    }
    if (!res.ok) {
      const err = new Error(`Upstream ${res.status}`);
      err.status = res.status;
      err.body = parsed;
      throw err;
    }
    return parsed;
  } finally {
    clearTimeout(t);
  }
}

function requireEnv(env, keys) {
  const missing = [];
  for (const k of keys) if (!isString(env[k])) missing.push(k);
  return missing;
}

/** ---------- Core helpers ---------- **/

async function fetchLatestCpiFromFred(env) {
  const missing = requireEnv(env, ["FRED_API_KEY"]);
  if (missing.length) {
    const e = new Error("Missing required env vars");
    e.code = "MISSING_ENV";
    e.details = { missing };
    throw e;
  }

  const upstream =
    "https://api.stlouisfed.org/fred/series/observations" +
    `?series_id=CPIAUCSL&api_key=${encodeURIComponent(env.FRED_API_KEY)}` +
    `&file_type=json&sort_order=desc&limit=1`;

  const data = await fetchJson(upstream);
  const obs = data?.observations?.[0];
  if (!obs) {
    const e = new Error("FRED returned no CPI observations");
    e.code = "NO_OBSERVATIONS";
    e.details = data;
    throw e;
  }

  return {
    series_id: "CPIAUCSL",
    date: obs.date,
    value: obs.value,
    fetched_at: nowIso(),
  };
}

async function putCpiSnapshot(env, payload) {
  const kv = env.CPI_SNAPSHOTS;
  if (!kv) {
    const e = new Error("KV binding CPI_SNAPSHOTS is not configured");
    e.code = "MISSING_KV";
    throw e;
  }
  await kv.put("cpi:latest", JSON.stringify(payload), { expirationTtl: 6 * 60 * 60 });
}

/** ---------- Route handlers ---------- **/

async function handleHealth(env) {
  return json({
    ok: true,
    service: env.SERVICE_NAME || "construction-ai-terminal",
    ts: nowIso(),
    git_sha: env.GIT_SHA || null,
    has_kv: !!env.CPI_SNAPSHOTS,
    has_fred_key: isString(env.FRED_API_KEY),
  });
}

async function handleFredObservations(request, env) {
  const missing = requireEnv(env, ["FRED_API_KEY"]);
  if (missing.length) {
    return json(
      {
        ok: false,
        service: env.SERVICE_NAME || "construction-ai-terminal",
        ts: nowIso(),
        git_sha: env.GIT_SHA || null,
        error: { message: "Missing required env vars", code: "MISSING_ENV", details: { missing } },
      },
      500
    );
  }

  const url = new URL(request.url);
  const seriesId = url.searchParams.get("series_id") || "CPIAUCSL";
  const limit = url.searchParams.get("limit") || "24";

  const upstream =
    "https://api.stlouisfed.org/fred/series/observations" +
    `?series_id=${encodeURIComponent(seriesId)}` +
    `&api_key=${encodeURIComponent(env.FRED_API_KEY)}` +
    `&file_type=json` +
    `&sort_order=desc` +
    `&limit=${encodeURIComponent(limit)}`;

  try {
    const data = await fetchJson(upstream, { headers: { accept: "application/json" } });
    return json({ ok: true, source: "fred", series_id: seriesId, limit: Number(limit), data });
  } catch (e) {
    return serverError("FRED request failed", {
      message: e.message,
      status: e.status || 0,
      body: e.body || null,
    });
  }
}

async function handleCpi(env) {
  const kv = env.CPI_SNAPSHOTS;
  if (!kv) return serverError("KV binding CPI_SNAPSHOTS is not configured");

  // 1) KV
  try {
    const cached = await kv.get("cpi:latest", { type: "json" });
    if (cached) return json({ ok: true, source: "kv", ts: nowIso(), cpi: cached });
  } catch {
    // continue
  }

  // 2) FRED fallback
  try {
    const payload = await fetchLatestCpiFromFred(env);
    await putCpiSnapshot(env, payload);
    return json({
      ok: true,
      source: "fred",
      ts: nowIso(),
      cpi: { ...payload, note: "live-fallback (cron snapshot not present yet)" },
    });
  } catch (e) {
    return json(
      {
        ok: false,
        service: env.SERVICE_NAME || "construction-ai-terminal",
        ts: nowIso(),
        git_sha: env.GIT_SHA || null,
        error: { message: e.message, code: e.code || "ERROR", details: e.details || null },
      },
      500
    );
  }
}

async function handleNotionSeries(env) {
  if (!isString(env.NOTION_TOKEN) || !isString(env.NOTION_DATABASE_ID)) {
    return json(
      {
        ok: false,
        error: "Notion not configured",
        how_to_fix: [
          "Set NOTION_TOKEN (secret) in Cloudflare Worker settings",
          "Set NOTION_DATABASE_ID (variable) in Cloudflare Worker settings",
        ],
      },
      501
    );
  }

  const upstream = `https://api.notion.com/v1/databases/${encodeURIComponent(env.NOTION_DATABASE_ID)}/query`;

  try {
    const data = await fetchJson(
      upstream,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${env.NOTION_TOKEN}`,
          "content-type": "application/json",
          "notion-version": "2022-06-28",
        },
        body: JSON.stringify({
          page_size: 50,
          sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
        }),
      },
      20000
    );

    const results = (data?.results || []).map((p) => ({
      id: p.id,
      url: p.url,
      last_edited_time: p.last_edited_time,
      created_time: p.created_time,
      properties: p.properties || {},
    }));

    return json({ ok: true, source: "notion", count: results.length, results });
  } catch (e) {
    return serverError("Notion request failed", {
      message: e.message,
      status: e.status || 0,
      body: e.body || null,
    });
  }
}

async function handleBundle(request, env) {
  const url = new URL(request.url);
  const seriesId = url.searchParams.get("series_id") || "CPIAUCSL";

  const [healthRes, cpiRes] = await Promise.all([handleHealth(env), handleCpi(env)]);
  const health = await healthRes.json();
  const cpi = await cpiRes.json();

  let fred;
  try {
    const fakeReq = new Request(
      `https://local/fred/observations?series_id=${encodeURIComponent(seriesId)}&limit=5`
    );
    const fredRes = await handleFredObservations(fakeReq, env);
    fred = await fredRes.json();
  } catch {
    fred = { ok: false, error: "fred bundle failed" };
  }

  return json({ ok: true, ts: nowIso(), health, cpi, fred });
}

/** ---------- Router + Cron ---------- **/

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const { pathname } = new URL(request.url);

    try {
      if (request.method !== "GET") return json({ ok: false, error: "Method not allowed" }, 405);

      if (pathname === "/" || pathname === "/health") return handleHealth(env);
      if (pathname === "/fred/observations") return handleFredObservations(request, env);
      if (pathname === "/cpi") return handleCpi(env);
      if (pathname === "/notion/series") return handleNotionSeries(env);
      if (pathname === "/bundle") return handleBundle(request, env);

      return json({ ok: false, error: "Not found", path: pathname }, 404);
    } catch (e) {
      return serverError("Unhandled exception", { message: e?.message || String(e) });
    }
  },

  async scheduled(_event, env) {
    // Hourly warm cache: populate KV with latest CPI
    try {
      const payload = await fetchLatestCpiFromFred(env);
      await putCpiSnapshot(env, payload);
    } catch {
      // swallow: cron should never hard-fail
    }
  },
};
