/**
 * Production-ready Cloudflare Worker API (canonical construction-ai)
 *
 * Routes:
 *   GET  /health
 *   GET  /notion/series
 *   GET  /fred/observations?series_id=CPIAUCSL&limit=24
 *   GET  /cpi
 *   GET  /bundle
 *   GET  /signal
 *   GET  /regime
 *   GET  /liquidity
 *   GET  /construction-index
 *   GET  /risk-score
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

const DEFAULT_SERIES = [
  "CPIAUCSL",      // CPI
  "PERMIT",        // Building permits
  "HOUST",         // Housing starts
  "MORTGAGE30US",  // 30y mortgage rate
  "FEDFUNDS",      // Fed funds
  "UNRATE",        // Unemployment
  "TTLCONS",       // Total construction spending
];

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { ...JSON_HEADERS, ...CORS_HEADERS, ...extraHeaders },
  });
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

function serviceName(env) {
  return env.SERVICE_NAME || "construction-ai";
}

/** ---------- FRED helpers ---------- **/

function fredObservationsUrl(env, seriesId, limit = 12) {
  return (
    "https://api.stlouisfed.org/fred/series/observations" +
    `?series_id=${encodeURIComponent(seriesId)}` +
    `&api_key=${encodeURIComponent(env.FRED_API_KEY)}` +
    `&file_type=json&sort_order=desc&limit=${encodeURIComponent(String(limit))}`
  );
}

function parseObsValue(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function safeTrendPct(observations) {
  // observations are typically desc by date from FRED when sort_order=desc
  if (!Array.isArray(observations) || observations.length < 2) return null;
  const a = parseObsValue(observations[0]?.value);
  const b = parseObsValue(observations[1]?.value);
  if (a === null || b === null || b === 0) return null;
  return ((a - b) / Math.abs(b)) * 100;
}

function safeLatest(observations) {
  if (!Array.isArray(observations) || observations.length < 1) return null;
  return parseObsValue(observations[0]?.value);
}

function clamp(x, lo, hi) {
  if (x === null || x === undefined || !Number.isFinite(x)) return null;
  return Math.min(hi, Math.max(lo, x));
}

function scoreFromTrendPct(pct, lo = -2, hi = 2) {
  // Map trend percentage into 0-100; lo->0, hi->100
  if (pct === null) return null;
  const t = clamp((pct - lo) / (hi - lo), 0, 1);
  if (t === null) return null;
  return t * 100;
}

async function fetchFredSeries(env, seriesId, limit = 12) {
  const missing = requireEnv(env, ["FRED_API_KEY"]);
  if (missing.length) {
    const e = new Error("Missing required env vars");
    e.code = "MISSING_ENV";
    e.details = { missing };
    throw e;
  }
  const url = fredObservationsUrl(env, seriesId, limit);
  return fetchJson(url, { headers: { accept: "application/json" } });
}

/** ---------- KV helpers ---------- **/

async function kvGetJson(env, key) {
  const kv = env.CPI_SNAPSHOTS;
  if (!kv) return null;
  try {
    return await kv.get(key, { type: "json" });
  } catch {
    return null;
  }
}

async function kvPutJson(env, key, obj, ttlSeconds = 6 * 60 * 60) {
  const kv = env.CPI_SNAPSHOTS;
  if (!kv) return;
  try {
    await kv.put(key, JSON.stringify(obj), { expirationTtl: ttlSeconds });
  } catch {
    // swallow
  }
}

/** ---------- Core: CPI snapshot ---------- **/

async function fetchLatestCpiFromFred(env) {
  const data = await fetchFredSeries(env, "CPIAUCSL", 1);
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
  if (!env.CPI_SNAPSHOTS) {
    const e = new Error("KV binding CPI_SNAPSHOTS is not configured");
    e.code = "MISSING_KV";
    throw e;
  }
  await kvPutJson(env, "cpi:latest", payload, 6 * 60 * 60);
}

/** ---------- Route handlers ---------- **/

async function handleHealth(env) {
  return json({
    ok: true,
    service: serviceName(env),
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
        service: serviceName(env),
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

  const upstream = fredObservationsUrl(env, seriesId, limit);

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
  if (!env.CPI_SNAPSHOTS) return serverError("KV binding CPI_SNAPSHOTS is not configured");

  // 1) KV
  const cached = await kvGetJson(env, "cpi:latest");
  if (cached) return json({ ok: true, source: "kv", ts: nowIso(), cpi: cached });

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
        service: serviceName(env),
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

async function buildMacroSnapshot(env, limit = 12) {
  const cacheKey = `macro:snapshot:${limit}`;
  const cached = await kvGetJson(env, cacheKey);
  if (cached) return { snapshot: cached, source: "kv" };

  const missing = requireEnv(env, ["FRED_API_KEY"]);
  if (missing.length) {
    return {
      snapshot: {
        ok: false,
        error: { code: "MISSING_ENV", message: "Missing required env vars", details: { missing } },
      },
      source: "error",
    };
  }

  const series = {};
  for (const id of DEFAULT_SERIES) {
    try {
      const data = await fetchFredSeries(env, id, limit);
      const obs = data?.observations || [];
      series[id] = {
        latest: safeLatest(obs),
        trend_pct: safeTrendPct(obs),
        observations: obs.slice(0, Math.min(obs.length, 12)), // keep small
      };
    } catch (e) {
      series[id] = { error: { message: e.message, status: e.status || 0 } };
    }
  }

  const snapshot = {
    ok: true,
    ts: nowIso(),
    service: serviceName(env),
    series,
  };

  await kvPutJson(env, cacheKey, snapshot, 60 * 30); // 30 min cache
  return { snapshot, source: "live" };
}

function computeLiquidity(series) {
  // Tightness score: higher rates = tighter liquidity
  const mort = series?.MORTGAGE30US?.latest;
  const ffr = series?.FEDFUNDS?.latest;

  // Simple normalize:
  // mortgage 3% -> loose, 9% -> tight
  const mortTight = mort === null ? null : clamp(((mort - 3) / (9 - 3)) * 100, 0, 100);
  // fed funds 0% -> loose, 6% -> tight
  const ffrTight = ffr === null ? null : clamp((ffr / 6) * 100, 0, 100);

  const score =
    mortTight === null && ffrTight === null
      ? null
      : (Number(mortTight ?? 0) * 0.6 + Number(ffrTight ?? 0) * 0.4);

  const state =
    score === null ? "unknown" : score >= 70 ? "tight" : score >= 45 ? "neutral" : "easy";

  return { liquidity_score: score, liquidity_state: state, mortgage_rate: mort, fed_funds: ffr };
}

function computeConstructionIndex(series) {
  // Weighted composite: permits, starts, spending positive; mortgage inverse; unemployment inverse
  const permitsTrend = series?.PERMIT?.trend_pct;
  const startsTrend = series?.HOUST?.trend_pct;
  const spendTrend = series?.TTLCONS?.trend_pct;
  const mortTrend = series?.MORTGAGE30US?.trend_pct;
  const unempTrend = series?.UNRATE?.trend_pct;

  const permitsScore = scoreFromTrendPct(permitsTrend, -3, 3);
  const startsScore = scoreFromTrendPct(startsTrend, -3, 3);
  const spendScore = scoreFromTrendPct(spendTrend, -2, 2);

  // invert: rising mortgage/unemployment = worse
  const mortScore = mortTrend === null ? null : 100 - scoreFromTrendPct(mortTrend, -1, 1);
  const unempScore = unempTrend === null ? null : 100 - scoreFromTrendPct(unempTrend, -1, 1);

  const parts = [
    { v: permitsScore, w: 0.30 },
    { v: startsScore, w: 0.25 },
    { v: spendScore, w: 0.25 },
    { v: mortScore, w: 0.10 },
    { v: unempScore, w: 0.10 },
  ].filter((p) => p.v !== null);

  const index =
    parts.length === 0
      ? null
      : parts.reduce((a, p) => a + p.v * p.w, 0) / parts.reduce((a, p) => a + p.w, 0);

  const trendLabel =
    index === null ? "unknown" : index >= 65 ? "strengthening" : index >= 45 ? "flat" : "weakening";

  return { construction_index: index, construction_trend: trendLabel };
}

function computeRegime(liquidity, construction) {
  // Simple 4-regime model
  if (liquidity.liquidity_state === "tight" && (construction.construction_index ?? 50) < 45) {
    return { regime: "Contraction", confidence: 0.72 };
  }
  if (liquidity.liquidity_state === "tight" && (construction.construction_index ?? 50) < 60) {
    return { regime: "Late Cycle", confidence: 0.66 };
  }
  if (liquidity.liquidity_state !== "tight" && (construction.construction_index ?? 50) >= 60) {
    return { regime: "Expansion", confidence: 0.68 };
  }
  return { regime: "Neutral", confidence: 0.55 };
}

function computeRiskScore(liquidity, construction, series) {
  // Risk rises with tight liquidity and weakening construction + rising inflation trend
  const cpiTrend = series?.CPIAUCSL?.trend_pct;
  const inflationPressure = cpiTrend === null ? null : clamp(scoreFromTrendPct(cpiTrend, -0.2, 0.6), 0, 100);

  const liq = liquidity.liquidity_score;
  const idx = construction.construction_index;

  // risk_score: 0 (low risk) -> 100 (high risk)
  const components = [
    { v: liq, w: 0.45 },
    { v: idx === null ? null : (100 - idx), w: 0.40 },
    { v: inflationPressure, w: 0.15 },
  ].filter((p) => p.v !== null);

  const risk =
    components.length === 0
      ? null
      : components.reduce((a, p) => a + p.v * p.w, 0) / components.reduce((a, p) => a + p.w, 0);

  const level =
    risk === null ? "unknown" : risk >= 70 ? "high" : risk >= 45 ? "elevated" : "low";

  return { risk_score: risk, risk_level: level, inflation_trend_pct: cpiTrend };
}

function computeSignal(regime, risk, construction) {
  const idx = construction.construction_index ?? 50;
  const r = risk.risk_score ?? 50;

  let signal = "Neutral";
  if (idx >= 62 && r < 45) signal = "Bullish";
  if (idx < 48 || r >= 70) signal = "Bearish";

  const confidence =
    signal === "Bullish" ? 0.68 :
    signal === "Bearish" ? 0.70 : 0.55;

  return { signal, confidence, regime: regime.regime, risk_level: risk.risk_level };
}

async function handleBundle(request, env) {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") || "12");
  const use = (url.searchParams.get("series") || "").trim();

  const seriesList = use
    ? use.split(",").map((s) => s.trim()).filter(Boolean)
    : DEFAULT_SERIES;

  // Build snapshot for requested series (but keep cached macro snapshot for defaults)
  if (!use) {
    const { snapshot, source } = await buildMacroSnapshot(env, limit);
    return json({ ok: true, ts: nowIso(), service: serviceName(env), source, bundle: snapshot });
  }

  // custom series: fetch on demand (no caching)
  const series = {};
  for (const id of seriesList) {
    try {
      const data = await fetchFredSeries(env, id, limit);
      const obs = data?.observations || [];
      series[id] = { latest: safeLatest(obs), trend_pct: safeTrendPct(obs), observations: obs.slice(0, 12) };
    } catch (e) {
      series[id] = { error: { message: e.message, status: e.status || 0 } };
    }
  }
  return json({ ok: true, ts: nowIso(), service: serviceName(env), source: "live", bundle: { series } });
}

async function handleMacroEndpoint(env, limit = 12) {
  const { snapshot } = await buildMacroSnapshot(env, limit);
  if (!snapshot?.ok) {
    return json(
      {
        ok: false,
        service: serviceName(env),
        ts: nowIso(),
        error: snapshot?.error || { code: "UNKNOWN", message: "Unable to build macro snapshot" },
      },
      500
    );
  }

  const series = snapshot.series;
  const liquidity = computeLiquidity(series);
  const construction = computeConstructionIndex(series);
  const regime = computeRegime(liquidity, construction);
  const risk = computeRiskScore(liquidity, construction, series);
  const signal = computeSignal(regime, risk, construction);

  return { snapshot, series, liquidity, construction, regime, risk, signal };
}

async function handleSignal(env) {
  const { signal, liquidity, construction, regime, risk } = await handleMacroEndpoint(env);
  return json({
    ok: true,
    ts: nowIso(),
    service: serviceName(env),
    signal,
    regime,
    liquidity,
    construction,
    risk,
  });
}

async function handleRegime(env) {
  const { regime } = await handleMacroEndpoint(env);
  return json({ ok: true, ts: nowIso(), service: serviceName(env), regime });
}

async function handleLiquidity(env) {
  const { liquidity } = await handleMacroEndpoint(env);
  return json({ ok: true, ts: nowIso(), service: serviceName(env), liquidity });
}

async function handleConstructionIndex(env) {
  const { construction } = await handleMacroEndpoint(env);
  return json({ ok: true, ts: nowIso(), service: serviceName(env), construction });
}

async function handleRiskScore(env) {
  const { risk } = await handleMacroEndpoint(env);
  return json({ ok: true, ts: nowIso(), service: serviceName(env), risk });
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

      if (pathname === "/signal") return handleSignal(env);
      if (pathname === "/regime") return handleRegime(env);
      if (pathname === "/liquidity") return handleLiquidity(env);
      if (pathname === "/construction-index") return handleConstructionIndex(env);
      if (pathname === "/risk-score") return handleRiskScore(env);

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
      // cron should never hard-fail
    }
  },
};
