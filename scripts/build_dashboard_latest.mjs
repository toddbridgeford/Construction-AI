// scripts/build_dashboard_latest.mjs
import fs from "fs";

// -------------------- Env --------------------
const API_KEY = process.env.FRED_API_KEY;
const OUT_PATH = process.env.OUT_PATH || "dashboard_latest.json";

// Default observation start (can be overridden by fred_signals.json)
const OBS_START_ENV = process.env.FRED_OBSERVATION_START || null;

if (!API_KEY) {
  console.error("Missing FRED_API_KEY (set it as a GitHub Actions secret).");
  process.exit(1);
}

// -------------------- Paths --------------------
const FRED_SIGNALS_PATH = "config/fred_signals.json";
const STATE_CONFIG_PATH = "config/state_permits.json";
const MSA_CONFIG_PATH = "config/msa_permits.json";

// Phase 3: optional config for public markets (no external API dependency)
const PUBLIC_MARKET_UNIVERSE_PATH = "config/public_market_universe.json";
const PUBLIC_MARKET_SNAPSHOT_PATH = "config/public_market_snapshot.json";

// Phase 2 framework (paths are canonical on Predictive-Model branch)
const ORCHESTRATOR_PATH = "framework/national_autonomous_run_orchestrator_v1.json";
const PRECEDENCE_PATH = "framework/national_execution_precedence_matrix_v1.json";

// -------------------- Helpers --------------------
function readJSONSafe(path) {
  try {
    if (!fs.existsSync(path)) return null;
    const raw = fs.readFileSync(path, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function toNumberSafe(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function clamp01(x) {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function parseDate(yyyy_mm_dd) {
  return new Date(`${yyyy_mm_dd}T00:00:00Z`);
}

function normalizeHistory(observations) {
  return (Array.isArray(observations) ? observations : [])
    .map(o => ({ date: o.date, value: toNumberSafe(o.value) }))
    .filter(p => p.value !== null);
}

function lastN(history, n) {
  if (!history || history.length < n) return null;
  return history.slice(history.length - n);
}

function lastTwo(history) {
  if (!history || history.length < 2) return { prev: null, last: null, delta: null };
  const last = history[history.length - 1].value;
  const prev = history[history.length - 2].value;
  return { prev, last, delta: last - prev };
}

// YoY: find point closest to ~365 days ago
function yoyFromHistory(history) {
  if (!history || history.length < 10) return null;

  const lastPt = history[history.length - 1];
  const lastDt = parseDate(lastPt.date);
  const target = new Date(lastDt.getTime() - 365 * 24 * 3600 * 1000);

  let best = null;
  let bestAbsDays = Infinity;

  for (const p of history) {
    const d = parseDate(p.date);
    const absDays = Math.abs((d - target) / (24 * 3600 * 1000));
    if (absDays < bestAbsDays) {
      bestAbsDays = absDays;
      best = p;
    }
  }

  if (!best || bestAbsDays > 45) return null;

  const prev = best.value;
  const last = lastPt.value;
  if (prev === 0) return null;

  return (last / prev - 1) * 100.0;
}

function momFromHistory(history) {
  const t = lastTwo(history);
  if (typeof t.delta !== "number") return { mom_change: null, mom_pct: null };
  const last = t.last;
  const prev = t.prev;
  const mom_change = t.delta;
  const mom_pct = (prev && prev !== 0) ? (mom_change / prev) * 100.0 : null;
  return { mom_change, mom_pct };
}

function mean(arr) {
  if (!arr || !arr.length) return null;
  const s = arr.reduce((a, b) => a + b, 0);
  return s / arr.length;
}

function movingAverage(history, k) {
  if (!history || history.length < k) return null;
  const slice = history.slice(history.length - k).map(p => p.value);
  return mean(slice);
}

// Simple 3-point slope over last 3 observations
function slopeLast3(history) {
  const pts = lastN(history, 3);
  if (!pts) return null;
  const y = pts.map(p => p.value);
  // x = 0,1,2; slope = ( (y2 - y0) / 2 )
  return (y[2] - y[0]) / 2;
}

function trendArrowFromSlope(slope) {
  if (typeof slope !== "number") return "flat";
  const eps = 1e-9;
  if (slope > eps) return "up";
  if (slope < -eps) return "down";
  return "flat";
}

// Pressure score 0–100 from last ~36 months of LEVELS
function pressureScoreFromLevel(history, invert = false) {
  if (!history || history.length < 10) return null;

  const lastPt = history[history.length - 1];
  const lastDt = parseDate(lastPt.date);
  const cutoff = new Date(lastDt.getTime() - 36 * 30 * 24 * 3600 * 1000);

  const window = history
    .filter(p => parseDate(p.date) >= cutoff)
    .map(p => p.value);

  if (window.length < 10) return null;

  const min = Math.min(...window);
  const max = Math.max(...window);
  const last = lastPt.value;

  const span = Math.max(1e-9, max - min);
  let t = (last - min) / span;
  t = clamp01(t);
  if (invert) t = 1 - t;

  return Math.round(t * 100);
}

function bandFromPressureIndex(pi) {
  if (pi === null || pi === undefined) return "Unknown";
  if (pi >= 70) return "Restrictive";
  if (pi >= 55) return "Tight";
  if (pi >= 40) return "Neutral";
  return "Easy";
}

function confidenceFromSignals({ componentScores }) {
  const available = componentScores.filter(x => typeof x === "number");
  if (available.length < 3) return "Low";

  const min = Math.min(...available);
  const max = Math.max(...available);
  const spread = max - min;

  if (spread < 35) return "High";
  return "Medium";
}

// Phase 2: precedence governance for confidence label
function applyConfidenceGovernance(rawConfidenceLabel, precedence) {
  if (!precedence || !precedence.confidence_stacking_order) {
    return rawConfidenceLabel;
  }

  const floor = precedence.confidence_stacking_order.final_floor ?? 0.4;
  const ceiling = precedence.confidence_stacking_order.final_ceiling ?? 0.9;

  // Map label → numeric midpoint
  const map = { Low: 0.45, Medium: 0.65, High: 0.85 };
  let numeric = map[rawConfidenceLabel] ?? 0.6;

  numeric = Math.max(floor, Math.min(ceiling, numeric));

  if (numeric >= 0.8) return "High";
  if (numeric >= 0.6) return "Medium";
  return "Low";
}

function buildAlerts({ permitsSouthYoY, permitsWestYoY }) {
  const alerts = [];

  if (typeof permitsSouthYoY === "number" && typeof permitsWestYoY === "number") {
    if (permitsSouthYoY > 0 && permitsWestYoY < 0) {
      alerts.push({
        title: "Regional mix risk: South stronger than West",
        why_it_matters: "South permits improving while West remains soft; monitor mix weekly.",
        severity: "monitor"
      });
    }
  }

  if (typeof permitsWestYoY === "number" && permitsWestYoY < -5) {
    alerts.push({
      title: "West permits weakening",
      why_it_matters: "Sustained West softness can offset national improvement; watch cancellations and pricing pressure.",
      severity: "watch"
    });
  }

  return alerts.slice(0, 3);
}

async function fredObservations({ seriesId, observationStart }) {
  const url = new URL("https://api.stlouisfed.org/fred/series/observations");
  url.searchParams.set("series_id", seriesId);
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("sort_order", "asc");
  url.searchParams.set("observation_start", observationStart);

  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`FRED failed (${res.status}) for ${seriesId}: ${text}`);
  }
  return res.json();
}

// Phase 3: standardized signal object
function makeSignal({
  key,
  name,
  series_id,
  units,
  frequency = "monthly",
  sa_flag = "SA",
  geo_level = "national",
  geo_id = "US",
  geo_name = "United States",
  segment = "total",
  history
}) {
  const yoy = yoyFromHistory(history);
  const { mom_change, mom_pct } = momFromHistory(history);
  const ma_3 = movingAverage(history, 3);
  const ma_6 = movingAverage(history, 6);
  const trend_3m_slope = slopeLast3(history);
  const trend_arrow = trendArrowFromSlope(trend_3m_slope);

  return {
    key,
    name,
    series_id,
    units,
    dimensions: { frequency, sa_flag, geo_level, geo_id, geo_name, segment },
    derived: {
      mom_change,
      mom_pct,
      yoy_pct: yoy,
      ma_3,
      ma_6,
      trend_3m_slope,
      trend_arrow
    },
    history
  };
}

// -------------------- Config loaders --------------------
function readFredSignalsConfig() {
  const cfg = readJSONSafe(FRED_SIGNALS_PATH);
  if (!cfg) {
    // Safe fallback (keeps Actions running even if config missing)
    return {
      primary_series_id: "MORTGAGE30US",
      observation_start_default: "2020-01-01",
      signals: [
        { key: "mortgage30", series_id: "MORTGAGE30US", name: "30Y Mortgage Rate", region: "US", units: "%" },
        { key: "cpi", series_id: "CPIAUCSL", name: "CPI (All Urban Consumers)", region: "US", units: "index" },
        { key: "unrate", series_id: "UNRATE", name: "Unemployment Rate", region: "US", units: "%" },
        { key: "houst", series_id: "HOUST", name: "Housing Starts", region: "US", units: "thousands" },
        { key: "permit", series_id: "PERMIT", name: "Building Permits", region: "US", units: "thousands" }
      ]
    };
  }
  return cfg;
}

function readStateConfig() {
  const cfg = readJSONSafe(STATE_CONFIG_PATH);
  if (!cfg) return { max_states: 0, states: [] };

  const max_states = typeof cfg.max_states === "number" ? cfg.max_states : 12;
  const states = Array.isArray(cfg.states) ? cfg.states : [];

  const usable = states
    .filter(s => s && typeof s.series_id === "string" && s.series_id.trim().length > 0)
    .map(s => ({
      code: String(s.code || "").trim(),
      name: String(s.name || s.code || "").trim(),
      series_id: String(s.series_id).trim()
    }))
    .filter(s => s.code && s.series_id);

  return { max_states, states: usable };
}

function readMsaConfig() {
  const cfg = readJSONSafe(MSA_CONFIG_PATH);
  if (!cfg) return { max_msas: 0, msas: [] };

  const max_msas = typeof cfg.max_msas === "number" ? cfg.max_msas : 12;
  const msas = Array.isArray(cfg.msas) ? cfg.msas : [];

  const usable = msas
    .filter(m => m && typeof m.series_id === "string" && m.series_id.trim().length > 0)
    .map(m => ({
      code: String(m.code || "").trim(),
      name: String(m.name || m.code || "").trim(),
      series_id: String(m.series_id).trim()
    }))
    .filter(m => m.code && m.series_id);

  return { max_msas, msas: usable };
}

function readPublicMarketUniverse() {
  const u = readJSONSafe(PUBLIC_MARKET_UNIVERSE_PATH);
  if (!u || !Array.isArray(u.tickers)) return { tickers: [] };
  return u;
}

function readPublicMarketSnapshot() {
  // Optional: you can later populate this from any provider (or manually)
  const s = readJSONSafe(PUBLIC_MARKET_SNAPSHOT_PATH);
  if (!s || !Array.isArray(s.rows)) return { rows: [] };
  return s;
}

// -------------------- Fetchers --------------------
async function fetchMacroSignals({ fredCfg, observationStart }) {
  const signals = fredCfg.signals || [];
  const results = await Promise.all(
    signals.map(async (sig) => {
      const data = await fredObservations({ seriesId: sig.series_id, observationStart });
      const history = normalizeHistory(data.observations);
      return makeSignal({
        key: sig.key,
        name: sig.name,
        series_id: sig.series_id,
        units: sig.units,
        frequency: "monthly",   // most of these are monthly in FRED; mortgage is weekly but still OK for now
        sa_flag: "SA",
        geo_level: "national",
        geo_id: "US",
        geo_name: "United States",
        segment: "total",
        history
      });
    })
  );
  return results;
}

async function fetchStatePermitSignals({ observationStart }) {
  const cfg = readStateConfig();
  const limit = Math.max(0, Math.min(cfg.max_states || 0, 50));
  const states = (cfg.states || []).slice(0, limit);

  if (!states.length) return { signals: [], loaded: 0, expected: 0 };

  const results = await Promise.all(
    states.map(async (s) => {
      try {
        const data = await fredObservations({ seriesId: s.series_id, observationStart });
        const history = normalizeHistory(data.observations);
        if (history.length < 2) return null;

        return makeSignal({
          key: `permits_state_${s.code.toLowerCase()}`,
          name: "Building Permits",
          series_id: s.series_id,
          units: "units",
          frequency: "monthly",
          sa_flag: "SA",
          geo_level: "state",
          geo_id: s.code,
          geo_name: s.name || s.code,
          segment: "total",
          history
        });
      } catch {
        return null;
      }
    })
  );

  const usableSignals = results.filter(Boolean);
  return {
    signals: usableSignals,
    loaded: usableSignals.length,
    expected: states.length
  };
}

async function fetchMsaPermitSignals({ observationStart }) {
  const cfg = readMsaConfig();
  const limit = Math.max(0, Math.min(cfg.max_msas || 0, 50));
  const msas = (cfg.msas || []).slice(0, limit);

  if (!msas.length) return { signals: [], loaded: 0, expected: 0 };

  const results = await Promise.all(
    msas.map(async (m) => {
      try {
        const data = await fredObservations({ seriesId: m.series_id, observationStart });
        const history = normalizeHistory(data.observations);
        if (history.length < 2) return null;

        return makeSignal({
          key: `permits_msa_${m.code.toLowerCase()}`,
          name: "Building Permits",
          series_id: m.series_id,
          units: "units",
          frequency: "monthly",
          sa_flag: "SA",
          geo_level: "msa",
          geo_id: m.code,
          geo_name: m.name || m.code,
          segment: "total",
          history
        });
      } catch {
        return null;
      }
    })
  );

  const usableSignals = results.filter(Boolean);
  return {
    signals: usableSignals,
    loaded: usableSignals.length,
    expected: msas.length
  };
}

// -------------------- Build dashboard --------------------
function buildDashboard({
  orchestrator,
  precedence,
  macroSignals,
  stateSignalsInfo,
  msaSignalsInfo
}) {
  // Pick a few macro series for CPI / mortgage / unrate / permits / starts pressure index
  const byKey = Object.fromEntries((macroSignals || []).map(s => [s.key, s]));

  const mortgageHist = byKey.mortgage30?.history || [];
  const cpiHist = byKey.cpi?.history || [];
  const unrateHist = byKey.unrate?.history || [];
  const houstHist = byKey.houst?.history || [];
  const permitHist = byKey.permit?.history || [];

  const mortgageScore = pressureScoreFromLevel(mortgageHist, false);

  const cpiYoY = yoyFromHistory(cpiHist);
  const cpiScore =
    (typeof cpiYoY === "number")
      ? Math.round(clamp01((cpiYoY + 2) / 8) * 100)
      : null;

  const unrateScore = pressureScoreFromLevel(unrateHist, false);
  const permitsScore = pressureScoreFromLevel(permitHist, true);
  const startsScore = pressureScoreFromLevel(houstHist, true);

  const components = [
    { w: 0.35, v: mortgageScore },
    { w: 0.20, v: cpiScore },
    { w: 0.15, v: unrateScore },
    { w: 0.15, v: permitsScore },
    { w: 0.15, v: startsScore }
  ];

  const usable = components.filter(x => typeof x.v === "number");
  const pressure_index = usable.length
    ? Math.round(
        usable.reduce((acc, x) => acc + x.w * x.v, 0) /
        usable.reduce((acc, x) => acc + x.w, 0)
      )
    : null;

  const band = bandFromPressureIndex(pressure_index);

  const rawConfidence = confidenceFromSignals({
    componentScores: [mortgageScore, cpiScore, unrateScore, permitsScore, startsScore]
  });
  const confidence = applyConfidenceGovernance(rawConfidence, precedence);

  // Alerts (use regional series if present; otherwise remain empty)
  // If you later add PERMITNE/PERMITMW/PERMITS/PERMITW to fred_signals.json, we can key off them.
  const alerts = buildAlerts({ permitsSouthYoY: null, permitsWestYoY: null });

  const m = lastTwo(mortgageHist);
  const c = lastTwo(cpiHist);
  const u = lastTwo(unrateHist);

  const bullets = [];
  if (typeof m.delta === "number") bullets.push(`Mortgage Δ: ${m.delta >= 0 ? "+" : ""}${m.delta.toFixed(2)} pts`);
  if (typeof c.delta === "number") bullets.push(`CPI Δ: ${c.delta >= 0 ? "+" : ""}${c.delta.toFixed(2)}`);
  if (typeof u.delta === "number") bullets.push(`Unemployment Δ: ${u.delta >= 0 ? "+" : ""}${u.delta.toFixed(2)} pts`);

  const statesLoaded = stateSignalsInfo?.loaded ?? 0;
  const statesExpected = stateSignalsInfo?.expected ?? 0;

  const msasLoaded = msaSignalsInfo?.loaded ?? 0;
  const msasExpected = msaSignalsInfo?.expected ?? 0;

  const stateNote = statesExpected > 0 ? `State permits loaded: ${statesLoaded}/${statesExpected}` : "";
  const msaNote = msasExpected > 0 ? `MSA permits loaded: ${msasLoaded}/${msasExpected}` : "";
  const loadNote = [stateNote, msaNote].filter(Boolean).join(" • ");

  // Public market panel (Phase 3)
  const universe = readPublicMarketUniverse();
  const snap = readPublicMarketSnapshot();
  const snapByTicker = Object.fromEntries((snap.rows || []).map(r => [String(r.ticker || "").toUpperCase(), r]));

  const public_market = (universe.tickers || []).map(t => {
    const ticker = String(t.ticker || "").toUpperCase();
    const row = snapByTicker[ticker] || null;
    return {
      ticker,
      company_name: t.company_name || null,
      subsector: t.subsector || null,
      exposure_tags: t.exposure_tags || [],
      // provider-populated (optional)
      price_change_1w: row?.price_change_1w ?? null,
      price_change_1m: row?.price_change_1m ?? null,
      price_change_ytd: row?.price_change_ytd ?? null,
      signal_flag: row?.signal_flag ?? null,
      asof: row?.asof ?? null
    };
  });

  const generated_at = new Date().toISOString();

  return {
    schema_version: "3.0.0",
    generated_at,
    orchestrator: orchestrator?.name || "unknown",
    precedence_matrix: precedence?.name || "unknown",

    executive: {
      headline: "Macro conditions auto-updated; state/MSA permits added; Phase 3 structure active",
      confidence,
      summary: loadNote ? `Auto-updated from FRED. ${loadNote}` : "Auto-updated from FRED."
    },

    capital: {
      pressure_index: pressure_index ?? 0,
      band,
      // keep CPI history as a light-weight “capital environment” proxy
      history: (cpiHist || []).slice(-60)
    },

    // Phase 3: everything in one normalized list
    signals: [
      ...(macroSignals || []),
      ...(stateSignalsInfo?.signals || []),
      ...(msaSignalsInfo?.signals || [])
    ],

    alerts,

    panels: {
      public_market: {
        rows: public_market
      }
    },

    deep_analysis: {
      what_changed: bullets.length
        ? (bullets.join(" • ") + (loadNote ? " • " + loadNote : ""))
        : ("Derived fields + state/MSA permits loaded." + (loadNote ? " " + loadNote : "")),
      what_to_do_next: [
        "Use trend_arrow + yoy_pct to detect inflections earlier than headlines.",
        "Compare permits across states vs MSAs to spot concentration and divergence.",
        "Add a market snapshot (optional) to fill Panel A without new dependencies."
      ]
    }
  };
}

// -------------------- Main --------------------
(async () => {
  const orchestrator = readJSONSafe(ORCHESTRATOR_PATH);
  const precedence = readJSONSafe(PRECEDENCE_PATH);

  const fredCfg = readFredSignalsConfig();
  const observationStart =
    OBS_START_ENV ||
    fredCfg.observation_start_default ||
    "2020-01-01";

  const [macroSignals, stateSignalsInfo, msaSignalsInfo] = await Promise.all([
    fetchMacroSignals({ fredCfg, observationStart }),
    fetchStatePermitSignals({ observationStart }),
    fetchMsaPermitSignals({ observationStart })
  ]);

  const dashboard = buildDashboard({
    orchestrator,
    precedence,
    macroSignals,
    stateSignalsInfo,
    msaSignalsInfo
  });

  fs.writeFileSync(OUT_PATH, JSON.stringify(dashboard, null, 2), "utf8");
  console.log(
    `Wrote ${OUT_PATH} | macro=${macroSignals.length} ` +
    `states=${stateSignalsInfo.loaded}/${stateSignalsInfo.expected} ` +
    `msas=${msaSignalsInfo.loaded}/${msaSignalsInfo.expected}`
  );
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
