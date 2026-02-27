// scripts/build_dashboard_latest.mjs
import fs from "fs";

// ---- Env ----
const API_KEY = process.env.FRED_API_KEY;

const SERIES_ID = process.env.FRED_SERIES_ID || "MORTGAGE30US"; // primary
const OBS_START = process.env.FRED_OBSERVATION_START || "2020-01-01";
const OUT_PATH = process.env.OUT_PATH || "dashboard_latest.json";

// Base signals
const CPI_SERIES_ID = process.env.FRED_CPI_SERIES_ID || "CPIAUCSL";
const UNRATE_SERIES_ID = process.env.FRED_UNRATE_SERIES_ID || "UNRATE";
const HOUST_SERIES_ID = process.env.FRED_HOUST_SERIES_ID || "HOUST";
const PERMIT_SERIES_ID = process.env.FRED_PERMIT_SERIES_ID || "PERMIT";

// Regional permits (Census regions)
const PERMIT_NE_SERIES_ID = process.env.FRED_PERMIT_NE_SERIES_ID || "PERMITNE";
const PERMIT_MW_SERIES_ID = process.env.FRED_PERMIT_MW_SERIES_ID || "PERMITMW";
const PERMIT_S_SERIES_ID = process.env.FRED_PERMIT_S_SERIES_ID || "PERMITS";
const PERMIT_W_SERIES_ID = process.env.FRED_PERMIT_W_SERIES_ID || "PERMITW";

// Config paths
const STATE_CONFIG_PATH = "config/state_permits.json";
const MSA_CONFIG_PATH = "config/msa_permits.json";

// Phase 2 (governance)
const PRECEDENCE_PATH = "framework/national_execution_precedence_matrix_v1.json";

if (!API_KEY) {
  console.error("Missing FRED_API_KEY (set it as a GitHub Actions secret).");
  process.exit(1);
}

// ---- Helpers ----
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

function readJSONSafe(path) {
  try {
    if (!fs.existsSync(path)) return null;
    const raw = fs.readFileSync(path, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Phase 2: confidence governance from precedence matrix
function applyConfidenceGovernance(rawLabel, precedence) {
  if (!precedence || !precedence.confidence_stacking_order) return rawLabel;

  const floor = precedence.confidence_stacking_order.final_floor ?? 0.4;
  const ceiling = precedence.confidence_stacking_order.final_ceiling ?? 0.9;

  const map = { Low: 0.45, Medium: 0.65, High: 0.85 };
  let numeric = map[rawLabel] ?? 0.6;

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

async function fredObservations(seriesId) {
  const url = new URL("https://api.stlouisfed.org/fred/series/observations");
  url.searchParams.set("series_id", seriesId);
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("sort_order", "asc");
  url.searchParams.set("observation_start", OBS_START);

  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`FRED failed (${res.status}) for ${seriesId}: ${text}`);
  }
  return res.json();
}

function makeSignal({ name, region, units, history }) {
  return {
    name,
    region,
    yoy: yoyFromHistory(history),
    units,
    history
  };
}

// --- Config readers ---
function readStateConfig() {
  const parsed = readJSONSafe(STATE_CONFIG_PATH);
  const states = Array.isArray(parsed?.states) ? parsed.states : [];
  const max_states = typeof parsed?.max_states === "number" ? parsed.max_states : 12;

  const usable = states
    .filter(s => s && typeof s.series_id === "string" && s.series_id.trim().length > 0)
    .map(s => ({
      code: String(s.code || "").trim(),
      name: String(s.name || s.code || "").trim(),
      series_id: String(s.series_id).trim()
    }));

  return { max_states, states: usable };
}

function readMSAConfig() {
  const parsed = readJSONSafe(MSA_CONFIG_PATH);
  const msas = Array.isArray(parsed?.msas) ? parsed.msas : [];
  const max_msas = typeof parsed?.max_msas === "number" ? parsed.max_msas : 12;

  const usable = msas
    .filter(s => s && typeof s.series_id === "string" && s.series_id.trim().length > 0)
    .map(s => ({
      code: String(s.code || "").trim(),
      name: String(s.name || s.code || "").trim(),
      series_id: String(s.series_id).trim()
    }));

  return { max_msas, msas: usable };
}

async function fetchConfiguredPermitSignals({ kind }) {
  const cfg = kind === "msa" ? readMSAConfig() : readStateConfig();
  const list = kind === "msa" ? (cfg.msas || []) : (cfg.states || []);
  const limitRaw = kind === "msa" ? cfg.max_msas : cfg.max_states;
  const limit = Math.max(0, Math.min(limitRaw || 0, 50));
  const selected = list.slice(0, limit);

  if (!selected.length) return { signals: [], loaded: 0, expected: 0 };

  const results = await Promise.all(
    selected.map(async (s) => {
      try {
        const data = await fredObservations(s.series_id);
        const hist = normalizeHistory(data.observations);
        if (hist.length < 2) return null;

        const regionLabel = s.name || s.code || (kind === "msa" ? "MSA" : "State");
        return makeSignal({
          name: "Building Permits",
          region: regionLabel,
          units: "units",
          history: hist
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
    expected: selected.length
  };
}

// --- Deduplicate signals by (name|region) ---
function dedupeSignals(signals) {
  const seen = new Set();
  const out = [];
  for (const s of signals) {
    const key = `${s.name}|${s.region || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

function buildDashboard({
  mortgageHist,
  cpiHist,
  unrateHist,
  houstHist,
  permitHist,
  permitNEHist,
  permitMWHist,
  permitSHist,
  permitWHist,
  stateSignalsInfo,
  msaSignalsInfo,
  precedence
}) {
  const stateSignals = stateSignalsInfo?.signals || [];
  const msaSignals = msaSignalsInfo?.signals || [];

  // Signals (Top 5 + regional + states + msas)
  const signals = dedupeSignals([
    makeSignal({ name: "30Y Mortgage Rate", region: "US", units: "%", history: mortgageHist }),
    makeSignal({ name: "CPI (All Urban Consumers)", region: "US", units: "index", history: cpiHist }),
    makeSignal({ name: "Unemployment Rate", region: "US", units: "%", history: unrateHist }),
    makeSignal({ name: "Housing Starts", region: "US", units: "thousands", history: houstHist }),
    makeSignal({ name: "Building Permits", region: "US", units: "units", history: permitHist }),

    // Regional divergence
    makeSignal({ name: "Building Permits", region: "Northeast", units: "units", history: permitNEHist }),
    makeSignal({ name: "Building Permits", region: "Midwest", units: "units", history: permitMWHist }),
    makeSignal({ name: "Building Permits", region: "South", units: "units", history: permitSHist }),
    makeSignal({ name: "Building Permits", region: "West", units: "units", history: permitWHist }),

    // Config-driven expansions
    ...stateSignals,
    ...msaSignals
  ]);

  // Composite pressure index (0–100)
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
  const pi = usable.length
    ? Math.round(
        usable.reduce((acc, x) => acc + x.w * x.v, 0) /
        usable.reduce((acc, x) => acc + x.w, 0)
      )
    : null;

  const band = bandFromPressureIndex(pi);

  const generated_at = new Date().toISOString();

  const rawConfidence = confidenceFromSignals({
    componentScores: [mortgageScore, cpiScore, unrateScore, permitsScore, startsScore]
  });
  const confidence = applyConfidenceGovernance(rawConfidence, precedence);

  const permitsSouthYoY = yoyFromHistory(permitSHist);
  const permitsWestYoY = yoyFromHistory(permitWHist);
  const alerts = buildAlerts({ permitsSouthYoY, permitsWestYoY });

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

  const stateNote = statesExpected > 0 ? ` • State permits loaded: ${statesLoaded}/${statesExpected}` : "";
  const msaNote = msasExpected > 0 ? ` • MSA permits loaded: ${msasLoaded}/${msasExpected}` : "";

  return {
    version: 1,
    generated_at,

    executive: {
      headline: "Macro conditions auto-updated; watch regional divergence",
      confidence,
      summary: `Auto-updated from FRED every run.${stateNote}${msaNote}`
    },

    capital: {
      pressure_index: pi ?? 0,
      band,
      history: (cpiHist || []).slice(-60)
    },

    signals,
    alerts,

    deep_analysis: {
      what_changed: bullets.length
        ? (bullets.join(" • ") + stateNote + msaNote)
        : ("YoY and composite pressure index recalculated automatically each run." + stateNote + msaNote),
      what_to_do_next: [
        "Track permits divergence (South vs West) weekly.",
        "Use CPI/UNRATE trend to anticipate rate path and project starts.",
        "Prioritize backlog quality and margin protection in restrictive regimes."
      ]
    }
  };
}

// ---- Main ----
(async () => {
  const precedence = readJSONSafe(PRECEDENCE_PATH);

  const stateSignalsInfo = await fetchConfiguredPermitSignals({ kind: "state" });
  const msaSignalsInfo = await fetchConfiguredPermitSignals({ kind: "msa" });

  const [
    mortgageData, cpiData, unrateData, houstData, permitData,
    permitNEData, permitMWData, permitSData, permitWData
  ] = await Promise.all([
    fredObservations(SERIES_ID),
    fredObservations(CPI_SERIES_ID),
    fredObservations(UNRATE_SERIES_ID),
    fredObservations(HOUST_SERIES_ID),
    fredObservations(PERMIT_SERIES_ID),

    fredObservations(PERMIT_NE_SERIES_ID),
    fredObservations(PERMIT_MW_SERIES_ID),
    fredObservations(PERMIT_S_SERIES_ID),
    fredObservations(PERMIT_W_SERIES_ID)
  ]);

  const mortgageHist = normalizeHistory(mortgageData.observations);
  const cpiHist = normalizeHistory(cpiData.observations);
  const unrateHist = normalizeHistory(unrateData.observations);
  const houstHist = normalizeHistory(houstData.observations);
  const permitHist = normalizeHistory(permitData.observations);

  const permitNEHist = normalizeHistory(permitNEData.observations);
  const permitMWHist = normalizeHistory(permitMWData.observations);
  const permitSHist = normalizeHistory(permitSData.observations);
  const permitWHist = normalizeHistory(permitWData.observations);

  const dashboard = buildDashboard({
    mortgageHist, cpiHist, unrateHist, houstHist, permitHist,
    permitNEHist, permitMWHist, permitSHist, permitWHist,
    stateSignalsInfo,
    msaSignalsInfo,
    precedence
  });

  fs.writeFileSync(OUT_PATH, JSON.stringify(dashboard, null, 2), "utf8");
  console.log(
    `Wrote ${OUT_PATH} (primary=${SERIES_ID}) states=${stateSignalsInfo.loaded}/${stateSignalsInfo.expected} msas=${msaSignalsInfo.loaded}/${msaSignalsInfo.expected}`
  );
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
