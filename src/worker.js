/**
 * Production-ready Cloudflare Worker API
 * Routes:
 *   GET /health
 *   GET /notion/series
 *   GET /fred/observations?series_id=CPIAUCSL&limit=24
 *   GET /cpi
 *   GET /bundle
 *
 * Required env vars (set in Cloudflare Dashboard > Worker > Settings > Variables & Secrets):
 *   FRED_API_KEY            (for /fred/* and /cpi fallback)
 * Optional env vars:
 *   NOTION_TOKEN            (for /notion/series)
 *   NOTION_DATABASE_ID      (for /notion/series)
 *
 * KV binding:
 *   CPI_SNAPSHOTS           (from wrangler.toml)
 */

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
};

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

/** ---------- Route handlers ---------- **/

async function handleHealth(env) {
  return json({
    ok: true,
    service: "construction-ai-terminal",
    ts: nowIso(),
    git_sha: env.GIT_SHA || null,
  });
}

async function handleFredObservations(request, env) {
  if (!isString(env.FRED_API_KEY)) {
    return badRequest("Missing env var FRED_API_KEY");
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
    const data = await fetchJson(upstream, { headers: { "accept": "application/json" } });
    return json({ ok: true, source: "fred", series_id: seriesId, limit: Number(limit), data });
  } catch (e) {
    return serverError("FRED request failed", {
      message: e.message,
      status: e.status || 0,
      body: e.body || null,
    });
  }
}

/**
 * /cpi
 * Strategy:
 * 1) Try KV key "cpi:latest"
 * 2) If missing, pull latest CPI from FRED series CPIAUCSL and cache into KV
 */
async function handleCpi(env) {
  const kv = env.CPI_SNAPSHOTS;
  if (!kv) return serverError("KV binding CPI_SNAPSHOTS is not configured");

  // 1) KV
  try {
    const cached = await kv.get("cpi:latest", { type: "json" });
    if (cached) {
      return json({ ok: true, source: "kv", ts: nowIso(), cpi: cached });
    }
  } catch (e) {
    // keep going; KV read failure shouldn't brick endpoint
  }

  // 2) FRED fallback
  if (!isString(env.FRED_API_KEY)) {
    return badRequest("Missing env var FRED_API_KEY (required if KV is empty)");
  }

  const upstream =
    "https://api.stlouisfed.org/fred/series/observations" +
    `?series_id=CPIAUCSL&api_key=${encodeURIComponent(env.FRED_API_KEY)}` +
    `&file_type=json&sort_order=desc&limit=1`;

  try {
    const data = await fetchJson(upstream);
    const obs = data?.observations?.[0];
    if (!obs) return serverError("FRED returned no CPI observations", data);

    const payload = {
      series_id: "CPIAUCSL",
      date: obs.date,
      value: obs.value,
      fetched_at: nowIso(),
    };

    // cache for 6 hours
    await kv.put("cpi:latest", JSON.stringify(payload), { expirationTtl: 6 * 60 * 60 });

    return json({ ok: true, source: "fred", ts: nowIso(), cpi: payload });
  } catch (e) {
    return serverError("CPI fetch/cache failed", {
      message: e.message,
      status: e.status || 0,
      body: e.body || null,
    });
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

  const upstream = `https://api.notion.com/v1/databases/${encodeURIComponent(
    env.NOTION_DATABASE_ID
  )}/query`;

  try {
    const data = await fetchJson(
      upstream,
      {
        method: "POST",
        headers: {
          "authorization": `Bearer ${env.NOTION_TOKEN}`,
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

    // Minimal “series” extraction (safe default)
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
  // bundle = health + cpi + optional fred sample
  const url = new URL(request.url);
  const seriesId = url.searchParams.get("series_id") || "CPIAUCSL";

  const [healthRes, cpiRes] = await Promise.all([
    handleHealth(env),
    handleCpi(env),
  ]);

  const health = await healthRes.json();
  const cpi = await cpiRes.json();

  let fred = null;
  try {
    const fakeReq = new Request(`https://local/fred/observations?series_id=${encodeURIComponent(seriesId)}&limit=5`);
    const fredRes = await handleFredObservations(fakeReq, env);
    fred = await fredRes.json();
  } catch {
    fred = { ok: false, error: "fred bundle failed" };
  }

  return json({
    ok: true,
    ts: nowIso(),
    health,
    cpi,
    fred,
  });
}

/** ---------- Router ---------- **/

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const { pathname } = new URL(request.url);

    try {
      if (request.method !== "GET") {
        return json({ ok: false, error: "Method not allowed" }, 405);
      }

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
};
