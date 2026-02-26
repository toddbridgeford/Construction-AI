// scripts/build_dashboard_latest.mjs
import fs from "fs";

const API_KEY = process.env.FRED_API_KEY;

// Primary signal (workflow input fallback handled in workflow bash)
const SERIES_ID = process.env.FRED_SERIES_ID || "MORTGAGE30US";

// Base signals
const CPI_SERIES_ID = process.env.FRED_CPI_SERIES_ID || "CPIAUCSL";
const UNRATE_SERIES_ID = process.env.FRED_UNRATE_SERIES_ID || "UNRATE";
const HOUST_SERIES_ID = process.env.FRED_HOUST_SERIES_ID || "HOUST";
const PERMIT_SERIES_ID = process.env.FRED_PERMIT_SERIES_ID || "PERMIT";

// Regional permits (C)
const PERMIT_NE_SERIES_ID = process.env.FRED_PERMIT_NE_SERIES_ID || "PERMITNE";
const PERMIT_MW_SERIES_ID = process.env.FRED_PERMIT_MW_SERIES_ID || "PERMITMW";
const PERMIT_S_SERIES_ID = process.env.FRED_PERMIT_S_SERIES_ID || "PERMITS";
const PERMIT_W_SERIES_ID = process.env.FRED_PERMIT_W_SERIES_ID || "PERMITW";

const OBS_START = process.env.FRED_OBSERVATION_START || "2020-01-01";
const OUT_PATH = process.env.OUT_PATH || "dashboard_latest.json";

if (!API_KEY) {
  console.error("Missing FRED_API_KEY (set it as a GitHub Actions secret).");
  process.exit(1);
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

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function parseDate(yyyy_mm_dd) {
  // FRED dates are "YYYY-MM-DD"
  return new Date(`${yyyy_mm_dd}T00:00:00Z`);
}

function normalizeHistory(observations) {
  return (Array.isArray(observations) ? observations : [])
    .map(o => ({ date: o.date, value: toNumberSafe(o.value) }))
    .filter(p => p.value !== null);
}

function lastValue(history) {
  if (!history || history.length === 0) return null;
  return history[history.length - 1].value;
}

function lastTwo(history) {
  if (!history || history.length < 2) return { prev: null, last: null, delta: null };
  const last = history[history.length - 1].value;
  const prev = history[history.length - 2].value;
  return { prev, last, delta: last - prev };
}

// Find the value closest to ~365 days ago (stable, works across weekly/monthly)
function yoyFromHistory(history) {
  if (!history || history.length < 10) return null;

  const lastPt = history[history.length - 1];
  const lastDt = parseDate(lastPt.date);
  const target = new Date(lastDt.getTime() - 365 * 24 * 3600 * 1000);

  // find point with minimal abs day distance to target
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

  // if the closest point is too far, skip (prevents nonsense on short histories)
  if (!best || bestAbsDays > 45) return null;

  const prev = best.value;
  const last = lastPt.value;
  if (prev === 0) return null;

  return (last / prev - 1) * 100.0;
}

// Scale a series to a 0–100 “pressure” score based on last 36 months min/max.
// Higher score = more restrictive.
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
  let t = (last - min) / span; // 0..1
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

function confidenceFromSignals({ generatedAtISO, componentScores }) {
  // Simple & stable:
  // - If missing lots of components => Low
  // - If generated within 24h and have most components => Medium/High
  const available = componentScores.filter(x => typeof x === "number");
  if (available.length < 3) return "Low";

  const gen = new Date(generatedAtISO);
  const hours = (Date.now() - gen.getTime()) / 3600000;
  if (hours > 72) return "Low";

  // volatility proxy: spread across components
  const min = Math.min(...available);
  const max = Math.max(...available);
  const spread = max - min;

  if (hours < 24 && spread < 35) return "High";
  return "Medium";
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
  const yoy = yoyFromHistory(history);
  return {
    name,
    region,
    yoy,
    units,
    history
  };
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
  permitWHist
}) {
  // B) YoY computed per signal below
  const signals = [
    makeSignal({ name: "30Y Mortgage Rate", region: "US", units: "%", history: mortgageHist }),
    makeSignal({ name: "CPI (All Urban Consumers)", region: "US", units: "index", history: cpiHist }),
    makeSignal({ name: "Unemployment Rate", region: "US", units: "%", history: unrateHist }),
    makeSignal({ name: "Housing Starts", region: "US", units: "thousands", history: houstHist }),
    makeSignal({ name: "Building Permits", region: "US", units: "thousands", history: permitHist }),

    // C) Regional divergence signals
    makeSignal({ name: "Building Permits", region: "Northeast", units: "thousands", history: permitNEHist }),
    makeSignal({ name: "Building Permits", region: "Midwest", units: "thousands", history: permitMWHist }),
    makeSignal({ name: "Building Permits", region: "South", units: "thousands", history: permitSHist }),
    makeSignal({ name: "Building Permits", region: "West", units: "thousands", history: permitWHist }),
  ];

  // A) Composite pressure index 0–100
  const mortgageScore = pressureScoreFromLevel(mortgageHist, false); // higher mortgage => restrictive
  const cpiYoY = yoyFromHistory(cpiHist);
  const cpiScore = (typeof cpiYoY === "number")
    ? Math.round(clamp01((cpiYoY + 2) / 8) * 100) // map ~[-2..+6] to 0..100 (stable heuristic)
    : null;

  const unrateScore = pressureScoreFromLevel(unrateHist, false);     // higher unemployment => restrictive
  const permitsScore = pressureScoreFromLevel(permitHist, true);     // lower permits => restrictive (invert)
  const startsScore  = pressureScoreFromLevel(houstHist, true);      // lower starts => restrictive (invert)

  const components = [
    { w: 0.35, v: mortgageScore },
    { w: 0.20, v: cpiScore },
    { w: 0.15, v: unrateScore },
    { w: 0.15, v: permitsScore },
    { w: 0.15, v: startsScore }
  ];

  const usable = components.filter(x => typeof x.v === "number");
  const pi = usable.length
    ? Math.round(usable.reduce((acc, x) => acc + x.w * x.v, 0) / usable.reduce((acc, x) => acc + x.w, 0))
    : null;

  const band = bandFromPressureIndex(pi);

  // D) Confidence
  const generated_at = new Date().toISOString();
  const confidence = confidenceFromSignals({
    generatedAtISO: generated_at,
    componentScores: [mortgageScore, cpiScore, unrateScore, permitsScore, startsScore]
  });

  // Alerts keyed to regional YoY divergence
  const permitsSouthYoY = yoyFromHistory(permitSHist);
  const permitsWestYoY  = yoyFromHistory(permitWHist);
  const alerts = buildAlerts({ permitsSouthYoY, permitsWestYoY });

  return {
    version: 1,
    generated_at,

    executive: {
      headline: "Macro conditions auto-updated; watch regional divergence",
      confidence,
      summary: "Auto-updated from FRED every run."
    },

    capital: {
      pressure_index: pi ?? 0,
      band,
      history: (mortgageHist || []).slice(-60) // keep CPI history lightweight for UI
    },

    signals,
    alerts,

    deep_analysis: {
      what_changed: "YoY and composite pressure index recalculated automatically each run.",
      what_to_do_next: [
        "Track permits divergence (South vs West) weekly.",
        "Use CPI/UNRATE trend to anticipate rate path and project starts.",
        "Prioritize backlog quality and margin protection in restrictive regimes."
      ]
    }
  };
}

(async () => {
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
    fredObservations(PERMIT_W_SERIES_ID),
  ]);

  const mortgageHist = normalizeHistory(mortgageData.observations);
  const cpiHist      = normalizeHistory(cpiData.observations);
  const unrateHist   = normalizeHistory(unrateData.observations);
  const houstHist    = normalizeHistory(houstData.observations);
  const permitHist   = normalizeHistory(permitData.observations);

  const permitNEHist = normalizeHistory(permitNEData.observations);
  const permitMWHist = normalizeHistory(permitMWData.observations);
  const permitSHist  = normalizeHistory(permitSData.observations);
  const permitWHist  = normalizeHistory(permitWData.observations);

  const dashboard = buildDashboard({
    mortgageHist, cpiHist, unrateHist, houstHist, permitHist,
    permitNEHist, permitMWHist, permitSHist, permitWHist
  });

  fs.writeFileSync(OUT_PATH, JSON.stringify(dashboard, null, 2), "utf8");
  console.log(`Wrote ${OUT_PATH} (primary=${SERIES_ID})`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
