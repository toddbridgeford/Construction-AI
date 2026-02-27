// scripts/build_dashboard_latest.mjs
import fs from "fs";

// ---- Env ----
const API_KEY = process.env.FRED_API_KEY;

const SERIES_ID = process.env.FRED_SERIES_ID || "MORTGAGE30US";
const OBS_START = process.env.FRED_OBSERVATION_START || "2020-01-01";
const OUT_PATH = process.env.OUT_PATH || "dashboard_latest.json";

// Base signals
const CPI_SERIES_ID = process.env.FRED_CPI_SERIES_ID || "CPIAUCSL";
const UNRATE_SERIES_ID = process.env.FRED_UNRATE_SERIES_ID || "UNRATE";
const HOUST_SERIES_ID = process.env.FRED_HOUST_SERIES_ID || "HOUST";
const PERMIT_SERIES_ID = process.env.FRED_PERMIT_SERIES_ID || "PERMIT";

// Regional permits
const PERMIT_NE_SERIES_ID = process.env.FRED_PERMIT_NE_SERIES_ID || "PERMITNE";
const PERMIT_MW_SERIES_ID = process.env.FRED_PERMIT_MW_SERIES_ID || "PERMITMW";
const PERMIT_S_SERIES_ID = process.env.FRED_PERMIT_S_SERIES_ID || "PERMITS";
const PERMIT_W_SERIES_ID = process.env.FRED_PERMIT_W_SERIES_ID || "PERMITW";

// State config
const STATE_CONFIG_PATH = "config/state_permits.json";

// Phase 2 files
const PRECEDENCE_PATH =
  "framework/national_execution_precedence_matrix_v1.json";

if (!API_KEY) {
  console.error("Missing FRED_API_KEY.");
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

function parseDate(d) {
  return new Date(`${d}T00:00:00Z`);
}

function normalizeHistory(obs) {
  return (Array.isArray(obs) ? obs : [])
    .map(o => ({ date: o.date, value: toNumberSafe(o.value) }))
    .filter(p => p.value !== null);
}

function yoyFromHistory(history) {
  if (!history || history.length < 10) return null;

  const last = history[history.length - 1];
  const target = new Date(parseDate(last.date).getTime() - 365 * 86400000);

  let best = null;
  let bestDiff = Infinity;

  for (const p of history) {
    const diff = Math.abs(parseDate(p.date) - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = p;
    }
  }

  if (!best || best.value === 0) return null;
  return (last.value / best.value - 1) * 100;
}

function pressureScore(history, invert = false) {
  if (!history || history.length < 12) return null;

  const window = history.slice(-36);
  const min = Math.min(...window.map(x => x.value));
  const max = Math.max(...window.map(x => x.value));
  const last = window[window.length - 1].value;

  let t = (last - min) / (max - min || 1);
  if (invert) t = 1 - t;
  return Math.round(t * 100);
}

function bandFromPI(pi) {
  if (pi >= 70) return "Restrictive";
  if (pi >= 55) return "Tight";
  if (pi >= 40) return "Neutral";
  return "Easy";
}

function applyConfidenceGovernance(raw, precedence) {
  if (!precedence?.confidence_stacking_order) return raw;

  const floor = precedence.confidence_stacking_order.final_floor ?? 0.4;
  const ceiling = precedence.confidence_stacking_order.final_ceiling ?? 0.9;

  const map = { Low: 0.45, Medium: 0.65, High: 0.85 };
  let n = map[raw] ?? 0.6;

  n = Math.max(floor, Math.min(ceiling, n));

  if (n >= 0.8) return "High";
  if (n >= 0.6) return "Medium";
  return "Low";
}

async function fred(series) {
  const url = new URL("https://api.stlouisfed.org/fred/series/observations");
  url.searchParams.set("series_id", series);
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("sort_order", "asc");
  url.searchParams.set("observation_start", OBS_START);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`FRED error ${series}`);
  return res.json();
}

// ---------------- Main ----------------

(async () => {
  const precedence = readJSONSafe(PRECEDENCE_PATH);

  const [
    mortgage, cpi, unrate, houst, permit
  ] = await Promise.all([
    fred(SERIES_ID),
    fred(CPI_SERIES_ID),
    fred(UNRATE_SERIES_ID),
    fred(HOUST_SERIES_ID),
    fred(PERMIT_SERIES_ID)
  ]);

  const mHist = normalizeHistory(mortgage.observations);
  const cHist = normalizeHistory(cpi.observations);
  const uHist = normalizeHistory(unrate.observations);
  const hHist = normalizeHistory(houst.observations);
  const pHist = normalizeHistory(permit.observations);

  const mortgageScore = pressureScore(mHist, false);
  const cpiScore = pressureScore(cHist, false);
  const unrateScore = pressureScore(uHist, false);
  const permitScore = pressureScore(pHist, true);

  const components = [
    { w: 0.4, v: mortgageScore },
    { w: 0.2, v: cpiScore },
    { w: 0.2, v: unrateScore },
    { w: 0.2, v: permitScore }
  ].filter(x => typeof x.v === "number");

  const pi = components.length
    ? Math.round(
        components.reduce((a, x) => a + x.w * x.v, 0) /
        components.reduce((a, x) => a + x.w, 0)
      )
    : 50;

  const band = bandFromPI(pi);

  const rawConfidence = components.length >= 3 ? "Medium" : "Low";
  const confidence = applyConfidenceGovernance(rawConfidence, precedence);

  const headline =
    pi >= 70
      ? "Restrictive regime: protect margin and backlog quality"
      : pi >= 55
      ? "Tight conditions: disciplined growth required"
      : pi >= 40
      ? "Neutral cycle: selective expansion"
      : "Easy capital environment: opportunity expansion";

  const dashboard = {
    version: 2,
    generated_at: new Date().toISOString(),
    executive: {
      headline,
      confidence,
      summary: "Phase 2 governed output via precedence matrix."
    },
    capital: {
      pressure_index: pi,
      band,
      history: cHist.slice(-60)
    },
    signals: []
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(dashboard, null, 2));
  console.log("Dashboard updated.");
})();
