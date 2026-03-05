/**
 * Construction AI Terminal — Cloudflare Worker
 *
 * Routes:
 *   GET  /health
 *   GET  /fred/observations?series_id=CPIAUCSL&limit=24
 *   GET  /cpi
 *   GET  /bundle
 *
 * Cron:
 *   Every hour compute "bundle:latest" + "cpi:latest" into KV CPI_SNAPSHOTS.
 *
 * Required Secrets (Cloudflare -> Worker -> Settings -> Variables & Secrets):
 *   FRED_API_KEY
 *
 * KV Binding (wrangler.toml):
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

/** ---------- FRED helpers ---------- **/

function requireFredKey(env) {
  // IMPORTANT: match your Cloudflare secret name exactly
  if (!isString(env.FRED_API_KEY)) {
    return {
      ok: false,
      error: "Missing env var FRED_API_KEY",
      how_to_fix: [
        "Cloudflare Dashboard -> Worker -> Settings -> Variables & Secrets",
        "Add Secret named FRED_API_KEY (exact spelling)",
        "Redeploy (or trigger a new deployment)",
      ],
      code: "MISSING_ENV",
      missing: "FRED_API_KEY",
      ts: nowIso(),
    };
  }
  return null;
}

async function fredObservations(env, seriesId, limit = 24) {
  const upstream =
    "https://api.stlouisfed.org/fred/series/observations" +
    `?series_id=${encodeURIComponent(seriesId)}` +
    `&api_key=${encodeURIComponent(env.FRED_API_KEY)}` +
    `&file_type=json` +
    `&sort_order=desc` +
    `&limit=${encodeURIComponent(String(limit))}`;

  return fetchJson(upstream, { headers: { accept: "application/json" } }, 20000);
}

/** ---------- Route handlers ---------- **/

async function handleHealth(env) {
  return json({
    ok: true,
    service: "construction-ai-terminal",
    ts: nowIso(),
    git_sha: env.GIT_SHA || null,
    has_kv: Boolean(env.CPI_SNAPSHOTS),
    has_fred_key: Boolean(env.FRED_API_KEY),
  });
}

async function handleFredObservations(request, env) {
  const missing = requireFredKey(env);
  if (missing) return json(missing, 500);

  const url = new URL(request.url);
  const seriesId = url.searchParams.get("series_id") || "CPIAUCSL";
  const limit = Number(url.searchParams.get("limit") || "24");

  try {
    const data = await fredObservations(env, seriesId, limit);
    return json({ ok: true, source: "fred", series_id: seriesId, limit, data });
  } catch (e) {
    return json(
      {
        ok: false,
        error: "FRED request failed",
        message: e.message,
        status: e.status || 0,
        body: e.body || null,
        ts: nowIso(),
      },
      502
    );
  }
}

async function handleCpi(env) {
  const kv = env.CPI_SNAPSHOTS;
  if (!kv) {
    return json(
      {
        ok: false,
        error: "KV binding CPI_SNAPSHOTS is not configured",
        how_to_fix: ["Create KV namespace", "Add kv_namespaces binding in wrangler.toml", "Redeploy"],
        ts: nowIso(),
      },
      500
    );
  }

  // 1) Prefer KV snapshot computed by cron
  try {
    const cached = await kv.get("cpi:latest", { type: "json" });
    if (cached) return json({ ok: true, source: "kv", ts: nowIso(), cpi: cached });
  } catch {
    // ignore and fall back
  }

  // 2) Fall back to live FRED
  const missing = requireFredKey(env);
  if (missing) return json(missing, 500);

  try {
    const data = await fredObservations(env, "CPIAUCSL", 1);
    const obs = data?.observations?.[0];
    if (!obs) {
      return json({ ok: false, error: "FRED returned no CPI observations", ts: nowIso(), data }, 502);
    }

    const payload = {
      series_id: "CPIAUCSL",
      date: obs.date,
      value: obs.value,
      fetched_at: nowIso(),
      note: "live-fallback (cron snapshot not present yet)",
    };

    // cache for 6 hours (optional)
    await kv.put("cpi:latest", JSON.stringify(payload), { expirationTtl: 6 * 60 * 60 });

    return json({ ok: true, source: "fred", ts: nowIso(), cpi: payload });
  } catch (e) {
    return json(
      {
        ok: false,
        error: "CPI fetch failed",
        message: e.message,
        status: e.status || 0,
        body: e.body || null,
        ts: nowIso(),
      },
      502
    );
  }
}

async function handleBundle(env) {
  const kv = env.CPI_SNAPSHOTS;
  if (!kv) {
    return json(
      {
        ok: false,
        error: "KV binding CPI_SNAPSHOTS is not configured",
        ts: nowIso(),
      },
      500
    );
  }

  const bundle = await kv.get("bundle:latest", { type: "json" });
  if (!bundle) {
    return json(
      {
        ok: false,
        status: "bundle not ready yet",
        how_to_fix: [
          "Wait until the next cron tick (top of hour UTC), or",
          "Trigger redeploy (it may run cron shortly after), or",
          "Manually call /cpi (it will populate cpi:latest even before cron)",
        ],
        ts: nowIso(),
      },
      202
    );
  }

  return json({ ok: true, source: "kv", ts: nowIso(), bundle });
}

/** ---------- Cron: compute bundle ---------- **/

async function computeAndStoreBundle(env) {
  const kv = env.CPI_SNAPSHOTS;
  if (!kv) throw new Error("Missing KV binding CPI_SNAPSHOTS");

  const missing = requireFredKey(env);
  if (missing) throw new Error("Missing FRED_API_KEY secret");

  // Keep this “bundle” small and reliable. Add more series later.
  const SERIES = [
    { id: "CPIAUCSL", label: "CPI (headline)" },
    { id: "HOUST", label: "Housing Starts" },
    { id: "PERMIT", label: "Building Permits" },
  ];

  const limit = 24;

  const results = {};
  for (const s of SERIES) {
    try {
      const data = await fredObservations(env, s.id, limit);
      // make it compact
      const obs = (data?.observations || []).map((o) => ({ date: o.date, value: o.value }));
      results[s.id] = { label: s.label, observations: obs };
    } catch (e) {
      results[s.id] = { label: s.label, error: true, message: e.message, status: e.status || 0 };
    }
  }

  // Derive CPI snapshot from CPIAUCSL last obs if present
  let cpiLatest = null;
  const cpiObs = results?.CPIAUCSL?.observations?.[0];
  if (cpiObs && cpiObs.date && cpiObs.value) {
    cpiLatest = {
      series_id: "CPIAUCSL",
      date: cpiObs.date,
      value: cpiObs.value,
      computed_at: nowIso(),
      source: "cron",
    };
    await kv.put("cpi:latest", JSON.stringify(cpiLatest), { expirationTtl: 24 * 60 * 60 });
  }

  const bundle = {
    meta: {
      computed_at: nowIso(),
      service: "construction-ai-terminal",
      git_sha: env.GIT_SHA || null,
      limit,
      series: SERIES.map((s) => s.id),
    },
    fred: results,
    cpi_latest: cpiLatest,
  };

  // Store hourly bundle for 24 hours
  await kv.put("bundle:latest", JSON.stringify(bundle), { expirationTtl: 24 * 60 * 60 });

  return bundle;
}

/** ---------- Router + Worker export ---------- **/

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const { pathname } = new URL(request.url);

    if (request.method !== "GET") {
      return json({ ok: false, error: "Method not allowed" }, 405);
    }

    try {
      if (pathname === "/" || pathname === "/health") return handleHealth(env);
      if (pathname === "/fred/observations") return handleFredObservations(request, env);
      if (pathname === "/cpi") return handleCpi(env);
      if (pathname === "/bundle") return handleBundle(env);

      return json({ ok: false, error: "Not found", path: pathname }, 404);
    } catch (e) {
      return json({ ok: false, error: "Unhandled exception", message: e?.message || String(e), ts: nowIso() }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    // Run bundle compute async; Cloudflare wants you to use waitUntil
    ctx.waitUntil(
      (async () => {
        try {
          await computeAndStoreBundle(env);
        } catch (e) {
          // last resort: write a failure marker into KV (helps debugging)
          try {
            if (env.CPI_SNAPSHOTS) {
              await env.CPI_SNAPSHOTS.put(
                "bundle:last_error",
                JSON.stringify({ ts: nowIso(), message: e?.message || String(e) }),
                { expirationTtl: 24 * 60 * 60 }
              );
            }
          } catch {}
        }
      })()
    );
  },
};
