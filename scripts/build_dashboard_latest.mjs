// scripts/build_dashboard_latest.mjs
import fs from "fs";

// ---- Env ----
const API_KEY = process.env.FRED_API_KEY;

const SERIES_ID = process.env.FRED_SERIES_ID || "MORTGAGE30US"; // primary
const OBS_START = process.env.FRED_OBSERVATION_START || "2020-01-01";
const OUT_PATH = process.env.OUT_PATH || "dashboard_latest.json";

// Base signals (A)
const CPI_SERIES_ID = process.env.FRED_CPI_SERIES_ID || "CPIAUCSL";
const UNRATE_SERIES_ID = process.env.FRED_UNRATE_SERIES_ID || "UNRATE";
const HOUST_SERIES_ID = process.env.FRED_HOUST_SERIES_ID || "HOUST";
const PERMIT_SERIES_ID = process.env.FRED_PERMIT_SERIES_ID || "PERMIT";

// Regional permits (B)
const PERMIT_NE_SERIES_ID = process.env.FRED_PERMIT_NE_SERIES_ID || "PERMITNE";
const PERMIT_MW_SERIES_ID = process.env.FRED_PERMIT_MW_SERIES_ID || "PERMITMW";
const PERMIT_S_SERIES_ID = process.env.FRED_PERMIT_S_SERIES_ID || "PERMITS";
const PERMIT_W_SERIES_ID = process.env.FRED_PERMIT_W_SERIES_ID || "PERMITW";

// Phase 3C + 3D config files
const STATE_CONFIG_PATH = "config/state_permits.json";
const MSA_CONFIG_PATH = "config/msa_permits.json";

// Phase 2 governance files
const ORCHESTRATOR_PATH =
  "framework/orchestrators/national_autonomous_run_orchestrator_v1.json";
const PRECEDENCE_PATH =
  "framework/national_execution_precedence_matrix_v1.json";

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

// ---- Phase 2: Governance (confidence floor/ceiling) ----
function readJSONSafe(path) {
  try {
    if (!fs.existsSync(path)) return null;
    const raw = fs.readFileSync(path, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
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

function applyConfidenceGovernance(rawConfidenceLabel, precedence) {
  if (!precedence || !precedence.confidence_stacking_order) return rawConfidenceLabel;

  const floor = precedence.confidence_stacking_order.final_floor ?? 0.4;
  const ceiling = precedence.confidence_stacking_order.final_ceiling ?? 0.9;

  // Label → numeric midpoint
  const map = { Low: 0.45, Medium: 0.65, High: 0.85 };
  let numeric = map[rawConfidenceLabel] ?? 0.6;

  numeric = Math.max(floor, Math.min(ceiling, numeric));

  if (numeric >= 0.8) return "High";
  if (numeric >= 0.6) return "Medium";
  return "Low";
}

// ---- Alerts ----
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

// ---- FRED ----
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

// ---- Config readers (3C + 3D) ----
function readPermitConfig(path, defaultMax = 12) {
  try {
    if (!fs.existsSync(path)) return { max_items: 0, items: [] };
    const raw = fs.readFileSync(path, "utf8");
    const parsed = JSON.parse(raw);

    const arr = Array.isArray(parsed.items) ? parsed.items : Array.isArray(parsed.states) ? parsed.states : Array.isArray(parsed.msas) ? parsed.msas : [];
    const max_items =
      typeof parsed.max_items === "number" ? parsed.max_items :
      typeof parsed.max_states === "number" ? parsed.max_states :
      typeof parsed.max_msas === "number" ? parsed.max_msas :
      defaultMax;

    const usable = arr
      .filter(x => x && typeof x.series_id === "string" && x.series_id.trim().length > 0)
      .map(x => ({
        code: String(x.code || "").trim(),
        name: String(x.name || x.code || "").trim(),
        series_id: String(x.series_id).trim()
      }))
      .filter(x => x.series_id.length > 0);

    return { max_items, items: usable };
  } catch {
    return { max_items: 0, items: [] };
  }
}

async function fetchPermitSignalsFromConfig({
  configPath,
  limitCap = 50,
  regionPrefix = ""
}) {
  const cfg = readPermitConfig(configPath, 12);
  const limit = Math.max(0, Math.min(cfg.max_items || 0, limitCap));
  const items = (cfg.items || []).slice(0, limit);

  if (!items.length) return { signals: [], loaded: 0, expected: 0 };

  const results = await Promise.all(
    items.map(async (x) => {
      try {
        const data = await fredObservations(x.series_id);
        const hist = normalizeHistory(data.observations);
        if (hist.length < 2) return null;

        const regionLabel = x.name || x.code || "Region";
        return makeSignal({
          name: "Building Permits",
          region: regionPrefix ? `${regionPrefix}: ${regionLabel}` : regionLabel,
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
    expected: items.length
  };
}

// ---- Dashboard builder ----
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
  orchestrator,
  precedence
}) {
  const stateSignals = stateSignalsInfo?.signals || [];
  const msaSignals = msaSignalsInfo?.signals || [];

  // A + B + C + D signals
  const signals = [
    // A) Macro (Top 5)
    makeSignal({ name: "30Y Mortgage Rate", region: "US", units: "%", history: mortgageHist }),
    makeSignal({ name: "CPI (All Urban Consumers)", region: "US", units: "index", history: cpiHist }),
    makeSignal({ name: "Unemployment Rate", region: "US", units: "%", history: unrateHist }),
    makeSignal({ name: "Housing Starts", region: "US", units: "thousands", history: houstHist }),
    makeSignal({ name: "Building Permits", region: "US", units: "thousands", history: permitHist }),

    // B) Regional divergence
    makeSignal({ name: "Building Permits", region: "Northeast", units: "thousands", history: permitNEHist }),
    makeSignal({ name: "Building Permits", region: "Midwest", units: "thousands", history: permitMWHist }),
    makeSignal({ name: "Building Permits", region: "South", units: "thousands", history: permitSHist }),
    makeSignal({ name: "Building Permits", region: "West", units: "thousands", history: permitWHist }),

    // C) States
    ...stateSignals,

    // D) MSAs
    ...msaSignals
  ];

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

  // Confidence + governance
  const rawConfidence = confidenceFromSignals({
    componentScores: [mortgageScore, cpiScore, unrateScore, permitsScore, startsScore]
  });
  const governedConfidence = applyConfidenceGovernance(rawConfidence, precedence);

  // Alerts keyed to regional YoY divergence
  const permitsSouthYoY = yoyFromHistory(permitSHist);
  const permitsWestYoY = yoyFromHistory(permitWHist);
  const alerts = buildAlerts({ permitsSouthYoY, permitsWestYoY });

  // What changed bullets
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

  const stateNote = statesExpected > 0 ? ` • States loaded: ${statesLoaded}/${statesExpected}` : "";
  const msaNote = msasExpected > 0 ? ` • MSAs loaded: ${msasLoaded}/${msasExpected}` : "";

  const generated_at = new Date().toISOString();

  const orchestratorVersion = orchestrator?.version ? `orchestrator_v${orchestrator.version}` : "orchestrator_v1";
  const precedenceVersion = precedence?.version ? `precedence_v${precedence.version}` : "precedence_v1";

  return {
    version: 1,
    generated_at,

    executive: {
      headline: "Macro conditions auto-updated; watch regional divergence",
      confidence: governedConfidence,
      summary: `Auto-updated from FRED every run. (${orchestratorVersion} • ${precedenceVersion}${stateNote}${msaNote})`
    },

    // CPI history powers your CPI trend/sparkline in the UI
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
        "Use state + MSA permits to identify where volume is accelerating or breaking down.",
        "Prioritize backlog quality and margin protection in restrictive regimes."
      ]
    }
  };
}

// ---- Main ----
(async () => {
  const orchestrator = readJSONSafe(ORCHESTRATOR_PATH);
  const precedence = readJSONSafe(PRECEDENCE_PATH);

  const stateSignalsInfo = await fetchPermitSignalsFromConfig({
    configPath: STATE_CONFIG_PATH,
    limitCap: 50,
    regionPrefix: "State"
  });

  const msaSignalsInfo = await fetchPermitSignalsFromConfig({
    configPath: MSA_CONFIG_PATH,
    limitCap: 50,
    regionPrefix: "MSA"
  });

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
    orchestrator,
    precedence
  });

  fs.writeFileSync(OUT_PATH, JSON.stringify(dashboard, null, 2), "utf8");
  console.log(
    `Wrote ${OUT_PATH} (primary=${SERIES_ID}) ` +
    `states=${stateSignalsInfo.loaded}/${stateSignalsInfo.expected} ` +
    `msas=${msaSignalsInfo.loaded}/${msaSignalsInfo.expected}`
  );
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
