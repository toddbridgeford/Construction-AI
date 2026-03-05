/**
 * Production-ready Cloudflare Worker API
 * Routes:
 *   GET /health
 *   GET /notion/series
 *   GET /fred/observations?series_id=CPIAUCSL&limit=24
 *   GET /cpi?force=1
 *   GET /bundle
 *
 * Required env vars:
 *   FRED_API_KEY            (for /fred/* and /cpi fallback)
 * Optional env vars:
 *   NOTION_TOKEN            (for /notion/series)
 *   NOTION_DATABASE_ID      (for /notion/series)
 *
 * KV binding:
 *   CPI_SNAPSHOTS           (KV Namespace binding name)
 */

const SERVICE_NAME = "construction-ai-terminal";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
};

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,OPTIONS",
  "access-control-allow-headers": "content-type,authorization",
  "access-control-max-age": "86400",
  "vary": "Origin",
};

function nowIso() {
  return new Date().toISOString();
}

function envelope(env, overrides = {}) {
  return {
    ok: true,
    service: SERVICE_NAME,
    ts: nowIso(),
    ...(env?.GIT_SHA ? { git_sha: env.GIT_SHA } : {}),
    ...overrides,
  };
}

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...JSON_HEADERS, ...CORS_HEADERS, ...extraHeaders },
  });
}

function errorResponse(env, status, message, code, details) {
  return jsonResponse(
    {
      ok: false,
      service: SERVICE_NAME,
      ts: nowIso(),
      ...(env?.GIT_SHA ? { git_sha: env.GIT_SHA } : {}),
      error: {
        message,
        ...(code ? { code } : {}),
        ...(details ? { details } : {}),
      },
    },
    status
  );
}

function badRequest(env, message, code, details) {
  return errorResponse(env, 400, message, code, details);
}

function methodNotAllowed(env) {
  return errorResponse(env, 405, "Method not allowed", "METHOD_NOT_ALLOWED");
}

function notFound(env, path) {
  return errorResponse(env, 404, "Not found", "NOT_FOUND", { path });
}

function isString(x) {
  return typeof x === "string" && x.length > 0;
}

function requireEnv(env, keys) {
  const missing = [];
  for (const k of keys) if (!isString(env?.[k])) missing.push(k);
  return missing;
}

async function fetchJson(url, init = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        "accept": "application/json",
        ...(init.headers || {}),
      },
      signal: controller.signal,
    });

    const text = await res.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = { raw: text };
    }

    if (!res.ok) {
      const err = new Error(`Upstream request failed (${res.status})`);
      err.status = res.status;
      err.body = parsed;
      throw err;
    }

    return parsed;
  } finally {
    clearTimeout(t);
  }
}

/** ---------- Handlers ---------- **/

async function handleHealth(request, env) {
  return jsonResponse(envelope(env));
}

async function handleFredObservations(request, env) {
  const missing = requireEnv(env, ["FRED_API_KEY"]);
  if (missing.length) {
    return badRequest(env, "Missing required env vars", "MISSING_ENV", { missing });
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
    const data = await fetchJson(upstream, {}, 20000);
    return jsonResponse(
      envelope(env, {
        data: { source: "fred", series_id: seriesId, limit: Number(limit), upstream: data },
      })
    );
  } catch (e) {
    return errorResponse(env, 502, "FRED request failed", "UPSTREAM_ERROR", {
      status: e.status || 0,
      body: e.body || null,
    });
  }
}

/**
 * GET /cpi
 * - Reads from KV key "cpi:latest" unless force=1
 * - Falls back to FRED CPIAUCSL if KV missing
 * - TTL default 12h (43200s)
 */
async function handleCpi(request, env) {
  const kv = env.CPI_SNAPSHOTS;
  if (!kv) return errorResponse(env, 500, "KV binding CPI_SNAPSHOTS is not configured", "KV_MISSING");

  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";
  const ttlSeconds = 12 * 60 * 60; // 12h

  if (!force) {
    try {
      const cached = await kv.get("cpi:latest", { type: "json" });
      if (cached) {
        return jsonResponse(envelope(env, { data: { source: "kv", cpi: cached } }));
      }
    } catch {
      // KV read failure shouldn't brick the endpoint
    }
  }

  const missing = requireEnv(env, ["FRED_API_KEY"]);
  if (missing.length) {
    return badRequest(env, "Missing required env vars (needed to refresh CPI)", "MISSING_ENV", { missing });
  }

  const upstream =
    "https://api.stlouisfed.org/fred/series/observations" +
    `?series_id=CPIAUCSL&api_key=${encodeURIComponent(env.FRED_API_KEY)}` +
    `&file_type=json&sort_order=desc&limit=1`;

  try {
    const data = await fetchJson(upstream, {}, 20000);
    const obs = data?.observations?.[0];
    if (!obs) {
      return errorResponse(env, 502, "FRED returned no CPI observations", "UPSTREAM_EMPTY", { upstream: data });
    }

    const payload = {
      series_id: "CPIAUCSL",
      date: obs.date,
      value: obs.value,
      fetched_at: nowIso(),
    };

    try {
      await kv.put("cpi:latest", JSON.stringify(payload), { expirationTtl: ttlSeconds });
    } catch {
      // KV write failure is non-fatal; still return the fresh value
    }

    return jsonResponse(envelope(env, { data: { source: "fred", cpi: payload } }));
  } catch (e) {
    return errorResponse(env, 502, "CPI fetch failed", "UPSTREAM_ERROR", {
      status: e.status || 0,
      body: e.body || null,
    });
  }
}

function pickNotionTitle(properties) {
  // Try to locate a Notion "title" type property and return the plain text
  if (!properties || typeof properties !== "object") return null;
  for (const key of Object.keys(properties)) {
    const prop = properties[key];
    if (prop?.type === "title" && Array.isArray(prop.title)) {
      const text = prop.title.map((t) => t?.plain_text || "").join("").trim();
      if (text) return text;
    }
  }
  return null;
}

async function handleNotionSeries(request, env) {
  const missing = requireEnv(env, ["NOTION_TOKEN", "NOTION_DATABASE_ID"]);
  if (missing.length) {
    return errorResponse(env, 501, "Notion not configured", "NOT_CONFIGURED", {
      missing,
      how_to_fix: [
        "Set NOTION_TOKEN (secret) in Cloudflare Worker settings",
        "Set NOTION_DATABASE_ID (variable) in Cloudflare Worker settings",
      ],
    });
  }

  const upstream = `https://api.notion.com/v1/databases/${encodeURIComponent(env.NOTION_DATABASE_ID)}/query`;

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

    const results = (data?.results || []).map((p) => ({
      id: p.id,
      title: pickNotionTitle(p.properties) || null,
      url: p.url,
      last_edited_time: p.last_edited_time,
      created_time: p.created_time,
    }));

    return jsonResponse(envelope(env, { data: { source: "notion", count: results.length, results } }));
  } catch (e) {
    return errorResponse(env, 502, "Notion request failed", "UPSTREAM_ERROR", {
      status: e.status || 0,
      body: e.body || null,
    });
  }
}

async function handleBundle(request, env) {
  const url = new URL(request.url);
  const seriesId = url.searchParams.get("series_id") || "CPIAUCSL";

  // Call internals without re-parsing Responses repeatedly
  const health = envelope(env);
  const cpiRes = await handleCpi(new Request(new URL("/cpi", request.url).toString()), env);
  const cpi = await cpiRes.json();

  let fred = null;
  try {
    const fredReq = new Request(new URL(`/fred/observations?series_id=${encodeURIComponent(seriesId)}&limit=5`, request.url).toString());
    const fredRes = await handleFredObservations(fredReq, env);
    fred = await fredRes.json();
  } catch {
    fred = errorResponse(env, 502, "Bundle FRED failed", "BUNDLE_ERROR");
  }

  return jsonResponse(
    envelope(env, {
      data: {
        health,
        cpi,
        fred,
      },
    })
  );
}

/** ---------- Router ---------- **/

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: { ...CORS_HEADERS } });
    }

    if (request.method !== "GET") {
      return methodNotAllowed(env);
    }

    const { pathname } = new URL(request.url);

    try {
      if (pathname === "/" || pathname === "/health") return handleHealth(request, env);
      if (pathname === "/fred/observations") return handleFredObservations(request, env);
      if (pathname === "/cpi") return handleCpi(request, env);
      if (pathname === "/notion/series") return handleNotionSeries(request, env);
      if (pathname === "/bundle") return handleBundle(request, env);

      return notFound(env, pathname);
    } catch (e) {
      return errorResponse(env, 500, "Unhandled exception", "UNHANDLED", { message: e?.message || String(e) });
    }
  },
};
