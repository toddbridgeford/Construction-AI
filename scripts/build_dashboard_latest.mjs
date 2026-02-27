// scripts/build_dashboard_latest.mjs
import fs from "fs";

// ---------------- Env ----------------
const API_KEY = process.env.FRED_API_KEY;
const OUT_PATH = process.env.OUT_PATH || "dashboard_latest.json";
const OBS_START = process.env.FRED_OBSERVATION_START || null;

const FRED_CONFIG_PATH = "config/fred_signals.json";
const STATE_CONFIG_PATH = "config/state_permits.json";

const PRECEDENCE_PATH = "framework/national_execution_precedence_matrix_v1.json";

if (!API_KEY) {
  console.error("Missing FRED_API_KEY (set it as a GitHub Actions secret).");
  process.exit(1);
}

// ---------------- Helpers ----------------
function readJSONSafe(path) {
  try {
    if (!fs.existsSync(path)) return null;
    return JSON.parse(fs.readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function toNumberSafe(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function parseDate(yyyy_mm_dd) {
  return new Date(`${yyyy_mm_dd}T00:00:00Z`);
}

function normalizeHistory(observations) {
  return (Array.isArray(observations) ? observations : [])
    .map(o => ({ date: o.date, value: toNumberSafe(o.value) }))
    .filter(p => p.value !== null);
}

// YoY: find the observation closest to ~365 days ago (stable across weekly/monthly)
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

  if (!best || bestAbsDays > 45) return null; // avoid nonsense on short histories
  if (best.value === 0) return null;

  return (lastPt.value / best.value - 1) * 100.0;
}

function clamp01(x) {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

// 0–100 “pressure” score from last ~36 months min/max.
// invert=true means lower level = more restrictive (permits/starts/spending)
function pressureScoreFromLevel(history, invert = false) {
  if (!history || history.length < 10) return null;

  const lastPt = history[history.length - 1];
  const lastDt = parseDate(lastPt.date);
  const cutoff = new Date(lastDt.getTime() - 36 * 30 * 24 * 3600 * 1000); // ~36 months

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

function confidenceFromComponents(componentScores) {
  const available = componentScores.filter(x => typeof x === "number");
  if (available.length < 3) return "Low";

  const min = Math.min(...available);
  const max = Math.max(...available);
  const spread = max - min;

  if (spread < 35) return "High";
  return "Medium";
}

// Phase 2 governance: apply floor/ceiling from precedence matrix
function applyConfidenceGovernance(rawConfidenceLabel, precedence) {
  if (!precedence || !precedence.confidence_stacking_order) return rawConfidenceLabel;

  const floor = precedence.confidence_stacking_order.final_floor ?? 0.4;
  const ceiling = precedence.confidence_stacking_order.final_ceiling ?? 0.9;

  const map = { Low: 0.45, Medium: 0.65, High: 0.85 };
  let numeric = map[rawConfidenceLabel] ?? 0.6;

  numeric = Math.max(floor, Math.min(ceiling, numeric));

  if (numeric >= 0.8) return "High";
  if (numeric >= 0.6) return "Medium";
  return "Low";
}

async function fredObservations(seriesId, observationStart) {
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

function makeSignal({ name, region, units, history }) {
  return {
    name,
    region,
    yoy: yoyFromHistory(history),
    units,
    history
  };
}

function readStateConfig() {
  const parsed = readJSONSafe(STATE_CONFIG_PATH);
  if (!parsed) return { max_states: 0, states: [] };

  const max_states = typeof parsed.max_states === "number" ? parsed.max_states : 12;
  const states = Array.isArray(parsed.states) ? parsed.states : [];

  const usable = states
    .filter(s => s && typeof s.series_id === "string" && s.series_id.trim().length > 0)
    .map(s => ({
      code: String(s.code || "").trim(),
      name: String(s.name || s.code || "").trim(),
      series_id: String(s.series_id).trim()
    }));

  return { max_states, states: usable };
}

async function fetchStatePermitSignals(observationStart) {
  const cfg = readStateConfig();
  const limit = Math.max(0, Math.min(cfg.max_states || 0, 50));
  const states = (cfg.states || []).slice(0, limit);

  if (!states.length) return { signals: [], loaded: 0, expected: 0 };

  const results = await Promise.all(
    states.map(async (s) => {
      try {
        const data = await fredObservations(s.series_id, observationStart);
        const hist = normalizeHistory(data.observations);
        if (hist.length < 2) return null;

        return makeSignal({
          name: "Building Permits",
          region: s.name || s.code || "State",
          units: "units",
          history: hist
        });
      } catch {
        return null;
      }
    })
  );

  const usableSignals = results.filter(Boolean);
  return { signals: usableSignals, loaded: usableSignals.length, expected: states.length };
}

// ---------------- Build Dashboard ----------------
function buildDashboard({ signalsMap, stateSignalsInfo, precedence }) {
  // Pull key histories for CPI index + pressure index components
  const mortgageHist = signalsMap.mortgage30?.history || [];
  const cpiHist = signalsMap.cpi?.history || [];
  const unrateHist = signalsMap.unrate?.history || [];
  const houstHist = signalsMap.houst?.history || [];
  const permitHist = signalsMap.permit?.history || [];

  // Pressure components (stable)
  const mortgageScore = pressureScoreFromLevel(mortgageHist, false);
  const cpiYoY = yoyFromHistory(cpiHist);
  const cpiScore = (typeof cpiYoY === "number")
    ? Math.round(clamp01((cpiYoY + 2) / 8) * 100) // heuristic map
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
    : 0;

  const band = bandFromPressureIndex(pi);

  const rawConfidence = confidenceFromComponents([mortgageScore, cpiScore, unrateScore, permitsScore, startsScore]);
  const confidence = applyConfidenceGovernance(rawConfidence, precedence);

  const headline =
    pi >= 70
      ? "Restrictive regime: protect margin and backlog quality"
      : pi >= 55
      ? "Tight conditions: disciplined growth required"
      : pi >= 40
      ? "Neutral cycle: selective expansion"
      : "Easy capital environment: opportunity expansion";

  const statesLoaded = stateSignalsInfo?.loaded ?? 0;
  const statesExpected = stateSignalsInfo?.expected ?? 0;
  const stateNote = statesExpected > 0 ? ` • State permits loaded: ${statesLoaded}/${statesExpected}` : "";

  // Signals: all config signals + state signals
  const signals = [
    ...Object.values(signalsMap).map(x => x.signal),
    ...(stateSignalsInfo?.signals || [])
  ];

  return {
    version: 2,
    generated_at: new Date().toISOString(),

    executive: {
      headline,
      confidence,
      summary: `Auto-updated from FRED every run.${stateNote}`
    },

    capital: {
      pressure_index: pi,
      band,
      history: cpiHist.slice(-60)
    },

    signals,
    alerts: [],

    deep_analysis: {
      what_changed: `Composite PI + YoY recomputed automatically.${stateNote}`,
      what_to_do_next: [
        "Track permits divergence (South vs West) weekly.",
        "Use CPI/UNRATE trend to anticipate rate path and project starts.",
        "Prioritize backlog quality and margin protection in restrictive regimes."
      ]
    }
  };
}

// ---------------- Main ----------------
(async () => {
  const fredCfg = readJSONSafe(FRED_CONFIG_PATH);
  if (!fredCfg || !Array.isArray(fredCfg.signals)) {
    throw new Error(`Missing or invalid ${FRED_CONFIG_PATH}. Create it first.`);
  }

  const precedence = readJSONSafe(PRECEDENCE_PATH);

  const observationStart =
    OBS_START ||
    fredCfg.observation_start_default ||
    "2020-01-01";

  // Fetch state signals in parallel
  const stateSignalsInfoPromise = fetchStatePermitSignals(observationStart);

  // Fetch configured signals
  const fetched = await Promise.all(
    fredCfg.signals.map(async (s) => {
      const data = await fredObservations(s.series_id, observationStart);
      const hist = normalizeHistory(data.observations);
      const signal = makeSignal({
        name: s.name,
        region: s.region,
        units: s.units,
        history: hist
      });
      return { key: s.key, history: hist, signal };
    })
  );

  const signalsMap = {};
  for (const item of fetched) signalsMap[item.key] = item;

  const stateSignalsInfo = await stateSignalsInfoPromise;

  const dashboard = buildDashboard({ signalsMap, stateSignalsInfo, precedence });

  fs.writeFileSync(OUT_PATH, JSON.stringify(dashboard, null, 2), "utf8");
  console.log(`Wrote ${OUT_PATH} with ${dashboard.signals.length} signals (states: ${stateSignalsInfo.loaded}/${stateSignalsInfo.expected})`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
