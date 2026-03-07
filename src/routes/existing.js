import { error, fetchJson, isString, nowIso, ok, requireEnv, serviceName } from "../lib/http.js";
import { fetchFredSeries, fredObservationsUrl, parseObsValue } from "../lib/fred.js";
import { kvGetJson, kvPutJson } from "../lib/kv.js";

export const DEFAULT_SERIES = [
  "CPIAUCSL",
  "PERMIT",
  "HOUST",
  "MORTGAGE30US",
  "FEDFUNDS",
  "UNRATE",
  "TTLCONS",
];

function parseLimitParam(rawLimit, fallback, min, max) {
  if (rawLimit === null) return { ok: true, value: fallback };

  const trimmed = String(rawLimit).trim();
  if (!/^\d+$/.test(trimmed)) {
    return {
      ok: false,
      reason: `limit must be an integer between ${min} and ${max}`,
    };
  }

  const limit = Number(trimmed);
  if (!Number.isInteger(limit) || limit < min || limit > max) {
    return {
      ok: false,
      reason: `limit must be an integer between ${min} and ${max}`,
    };
  }

  return { ok: true, value: limit };
}

function safeTrendPct(observations) {
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
  if (pct === null) return null;
  const t = clamp((pct - lo) / (hi - lo), 0, 1);
  if (t === null) return null;
  return t * 100;
}

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

export async function handleScheduled(env) {
  try {
    const payload = await fetchLatestCpiFromFred(env);
    await putCpiSnapshot(env, payload);
  } catch {
    // never crash cron
  }
}

export async function handleHealth(env) {
  return ok(env, {
    git_sha: env.GIT_SHA || null,
    has_kv: !!env.CPI_SNAPSHOTS,
    has_fred_key: isString(env.FRED_API_KEY),
  });
}

export async function handleFredObservations(request, env) {
  const missing = requireEnv(env, ["FRED_API_KEY"]);
  if (missing.length) return error(env, 500, "MISSING_ENV", "Missing required env vars", { missing });

  const url = new URL(request.url);
  const seriesId = url.searchParams.get("series_id") || "CPIAUCSL";
  const parsedLimit = parseLimitParam(url.searchParams.get("limit"), 24, 1, 5000);
  if (!parsedLimit.ok) {
    return error(env, 400, "LIMIT_INVALID", "Invalid limit query parameter", {
      reason: parsedLimit.reason,
    });
  }

  const limit = parsedLimit.value;
  const upstream = fredObservationsUrl(env, seriesId, String(limit));

  try {
    const data = await fetchJson(upstream, { headers: { accept: "application/json" } });
    return ok(env, { source: "fred", series_id: seriesId, limit: Number(limit), data });
  } catch (e) {
    return error(env, 502, "UPSTREAM_FRED", "FRED request failed", {
      message: e?.message || "Unknown error",
      status: e?.status || 0,
      body: e?.body || null,
    });
  }
}

export async function handleCpi(env) {
  if (!env.CPI_SNAPSHOTS) return error(env, 500, "MISSING_KV", "KV binding CPI_SNAPSHOTS is not configured");

  const cached = await kvGetJson(env, "cpi:latest");
  if (cached) return ok(env, { source: "kv", cpi: cached });

  try {
    const payload = await fetchLatestCpiFromFred(env);
    await putCpiSnapshot(env, payload);
    return ok(env, {
      source: "fred",
      cpi: { ...payload, note: "live-fallback (cron snapshot not present yet)" },
    });
  } catch (e) {
    return error(env, 500, e.code || "ERROR", e.message || "Unable to fetch CPI", e.details || null);
  }
}

export async function handleNotionSeries(env) {
  if (!isString(env.NOTION_TOKEN) || !isString(env.NOTION_DATABASE_ID)) {
    return error(env, 501, "NOT_CONFIGURED", "Notion not configured", {
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

    return ok(env, { source: "notion", count: results.length, results });
  } catch (e) {
    return error(env, 502, "UPSTREAM_NOTION", "Notion request failed", {
      message: e?.message || "Unknown error",
      status: e?.status || 0,
      body: e?.body || null,
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
      snapshot: { ok: false, error: { code: "MISSING_ENV", message: "Missing required env vars", details: { missing } } },
      source: "error",
    };
  }

  const series = {};
  for (const id of DEFAULT_SERIES) {
    try {
      const data = await fetchFredSeries(env, id, limit);
      const obs = data?.observations || [];
      series[id] = { latest: safeLatest(obs), trend_pct: safeTrendPct(obs), observations: obs.slice(0, Math.min(obs.length, 12)) };
    } catch (e) {
      series[id] = { error: { message: e.message, status: e.status || 0 } };
    }
  }

  const snapshot = { ok: true, ts: nowIso(), service: serviceName(env), series };
  await kvPutJson(env, cacheKey, snapshot, 60 * 30);
  return { snapshot, source: "live" };
}

function computeLiquidity(series) {
  const mort = series?.MORTGAGE30US?.latest;
  const ffr = series?.FEDFUNDS?.latest;
  const mortTight = mort === null ? null : clamp(((mort - 3) / (9 - 3)) * 100, 0, 100);
  const ffrTight = ffr === null ? null : clamp((ffr / 6) * 100, 0, 100);
  const score = mortTight === null && ffrTight === null ? null : Number(mortTight ?? 0) * 0.6 + Number(ffrTight ?? 0) * 0.4;
  const state = score === null ? "unknown" : score >= 70 ? "tight" : score >= 45 ? "neutral" : "easy";
  return { liquidity_score: score, liquidity_state: state, mortgage_rate: mort, fed_funds: ffr };
}

function computeConstructionIndex(series) {
  const permitsScore = scoreFromTrendPct(series?.PERMIT?.trend_pct, -3, 3);
  const startsScore = scoreFromTrendPct(series?.HOUST?.trend_pct, -3, 3);
  const spendScore = scoreFromTrendPct(series?.TTLCONS?.trend_pct, -2, 2);
  const mortTrend = series?.MORTGAGE30US?.trend_pct;
  const unempTrend = series?.UNRATE?.trend_pct;
  const mortScore = mortTrend === null ? null : 100 - scoreFromTrendPct(mortTrend, -1, 1);
  const unempScore = unempTrend === null ? null : 100 - scoreFromTrendPct(unempTrend, -1, 1);

  const parts = [
    { v: permitsScore, w: 0.3 },
    { v: startsScore, w: 0.25 },
    { v: spendScore, w: 0.25 },
    { v: mortScore, w: 0.1 },
    { v: unempScore, w: 0.1 },
  ].filter((p) => p.v !== null);

  const index =
    parts.length === 0 ? null : parts.reduce((a, p) => a + p.v * p.w, 0) / parts.reduce((a, p) => a + p.w, 0);

  const trendLabel = index === null ? "unknown" : index >= 65 ? "strengthening" : index >= 45 ? "flat" : "weakening";
  return { construction_index: index, construction_trend: trendLabel };
}

function computeRegime(liquidity, construction) {
  if (liquidity.liquidity_state === "tight" && (construction.construction_index ?? 50) < 45) return { regime: "Contraction", confidence: 0.72 };
  if (liquidity.liquidity_state === "tight" && (construction.construction_index ?? 50) < 60) return { regime: "Late Cycle", confidence: 0.66 };
  if (liquidity.liquidity_state !== "tight" && (construction.construction_index ?? 50) >= 60) return { regime: "Expansion", confidence: 0.68 };
  return { regime: "Neutral", confidence: 0.55 };
}

function computeRiskScore(liquidity, construction, series) {
  const cpiTrend = series?.CPIAUCSL?.trend_pct;
  const inflationPressure = cpiTrend === null ? null : clamp(scoreFromTrendPct(cpiTrend, -0.2, 0.6), 0, 100);
  const liq = liquidity.liquidity_score;
  const idx = construction.construction_index;

  const components = [
    { v: liq, w: 0.45 },
    { v: idx === null ? null : 100 - idx, w: 0.4 },
    { v: inflationPressure, w: 0.15 },
  ].filter((p) => p.v !== null);

  const risk =
    components.length === 0
      ? null
      : components.reduce((a, p) => a + p.v * p.w, 0) / components.reduce((a, p) => a + p.w, 0);
  const level = risk === null ? "unknown" : risk >= 70 ? "high" : risk >= 45 ? "elevated" : "low";

  return { risk_score: risk, risk_level: level, inflation_trend_pct: cpiTrend };
}

function computeSignal(regime, risk, construction) {
  const idx = construction.construction_index ?? 50;
  const r = risk.risk_score ?? 50;

  let signal = "Neutral";
  if (idx >= 62 && r < 45) signal = "Bullish";
  if (idx < 48 || r >= 70) signal = "Bearish";

  const confidence = signal === "Bullish" ? 0.68 : signal === "Bearish" ? 0.7 : 0.55;
  return { signal, confidence, regime: regime.regime, risk_level: risk.risk_level };
}

export async function handleBundle(request, env) {
  const url = new URL(request.url);
  const parsedLimit = parseLimitParam(url.searchParams.get("limit"), 12, 1, 5000);
  if (!parsedLimit.ok) {
    return error(env, 400, "LIMIT_INVALID", "Invalid limit query parameter", {
      reason: parsedLimit.reason,
    });
  }

  const limit = parsedLimit.value;
  const use = (url.searchParams.get("series") || "").trim();
  const seriesList = use ? use.split(",").map((s) => s.trim()).filter(Boolean) : DEFAULT_SERIES;

  if (!use) {
    const { snapshot, source } = await buildMacroSnapshot(env, limit);
    return ok(env, { source, bundle: snapshot });
  }

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
  return ok(env, { source: "live", bundle: { series } });
}

export async function buildMacroEndpointData(env, limit = 12) {
  const { snapshot } = await buildMacroSnapshot(env, limit);
  if (!snapshot?.ok) {
    return {
      failed: true,
      response: error(env, 500, snapshot?.error?.code || "UNKNOWN", snapshot?.error?.message || "Unable to build macro snapshot", snapshot?.error?.details || null),
    };
  }

  const series = snapshot.series;
  const liquidity = computeLiquidity(series);
  const construction = computeConstructionIndex(series);
  const regime = computeRegime(liquidity, construction);
  const risk = computeRiskScore(liquidity, construction, series);
  const signal = computeSignal(regime, risk, construction);

  return { failed: false, data: { snapshot, liquidity, construction, regime, risk, signal } };
}

export async function handleSignal(env) {
  const result = await buildMacroEndpointData(env);
  if (result.failed) return result.response;
  const { signal, liquidity, construction, regime, risk } = result.data;
  return ok(env, { signal, regime, liquidity, construction, risk });
}

export async function buildConstructionDashboard(env, limit = 12) {
  const result = await buildMacroEndpointData(env, limit);
  if (result.failed) return result;

  const { signal, regime, liquidity, risk, construction, snapshot } = result.data;
  const permitsTrendPct = Number.isFinite(snapshot?.series?.PERMIT?.trend_pct) ? snapshot.series.PERMIT.trend_pct : null;
  const startsTrendPct = Number.isFinite(snapshot?.series?.HOUST?.trend_pct) ? snapshot.series.HOUST.trend_pct : null;
  return {
    failed: false,
    data: {
      signal,
      regime,
      liquidity,
      risk,
      construction_index: construction?.construction_index ?? null,
      activity_trends: {
        permits_trend_pct: permitsTrendPct,
        starts_trend_pct: startsTrendPct,
      },
    },
  };
}

export async function handleConstructionDashboard(env) {
  const result = await buildConstructionDashboard(env);
  if (result.failed) return result.response;
  return ok(env, result.data);
}

export async function handleRegime(env) {
  const result = await buildMacroEndpointData(env);
  if (result.failed) return result.response;
  return ok(env, { regime: result.data.regime });
}

export async function handleLiquidity(env) {
  const result = await buildMacroEndpointData(env);
  if (result.failed) return result.response;
  return ok(env, { liquidity: result.data.liquidity });
}

export async function handleConstructionIndex(env) {
  const result = await buildMacroEndpointData(env);
  if (result.failed) return result.response;
  return ok(env, { construction: result.data.construction });
}

export async function handleRiskScore(env) {
  const result = await buildMacroEndpointData(env);
  if (result.failed) return result.response;
  return ok(env, { risk: result.data.risk });
}
