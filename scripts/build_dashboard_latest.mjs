// scripts/build_dashboard_latest.mjs
import fs from "fs";

// --- Env ---
const API_KEY = process.env.FRED_API_KEY;
const SERIES_ID = process.env.FRED_SERIES_ID || "MORTGAGE30US";

const CPI_SERIES_ID = process.env.FRED_CPI_SERIES_ID || "CPIAUCSL";
const UNRATE_SERIES_ID = process.env.FRED_UNRATE_SERIES_ID || "UNRATE";
const HOUST_SERIES_ID = process.env.FRED_HOUST_SERIES_ID || "HOUST";
const PERMIT_SERIES_ID = process.env.FRED_PERMIT_SERIES_ID || "PERMIT";

const OBS_START = process.env.FRED_OBSERVATION_START || "2020-01-01";
const OUT_PATH = process.env.OUT_PATH || "dashboard_latest.json";

if (!API_KEY) {
  console.error("Missing FRED_API_KEY (set it as a GitHub Actions secret).");
  process.exit(1);
}

// --- Helpers ---
function toNumberSafe(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function roundTo(n, decimals = 2) {
  if (n === null) return null;
  const p = Math.pow(10, decimals);
  return Math.round(n * p) / p;
}

// Normalize FRED observations -> [{date, value}]
function normalizeHistory(observations) {
  if (!Array.isArray(observations)) return [];
  const out = [];
  for (const o of observations) {
    const v = toNumberSafe(o.value);
    if (v === null) continue;
    out.push({ date: o.date, value: v });
  }
  return out;
}

function lastTwoValues(history) {
  if (!history || history.length === 0) return { last: null, prev: null, delta: null };
  if (history.length === 1) return { last: history[0].value, prev: null, delta: null };
  const last = history[history.length - 1].value;
  const prev = history[history.length - 2].value;
  return { last, prev, delta: last - prev };
}

// Simple band mapping (stable)
function bandFromPressureIndex(v) {
  if (v === null) return "Unknown";
  if (v >= 6.0) return "Restrictive";
  if (v >= 5.0) return "Tight";
  if (v >= 4.0) return "Neutral";
  return "Easy";
}

// Alerts (simple + stable)
function buildAlerts({ mortgageDelta, cpiDelta, unrateDelta }) {
  const alerts = [];

  if (mortgageDelta !== null) {
    if (mortgageDelta > 0.05) {
      alerts.push({
        title: "Mortgage rates rising",
        why_it_matters: "Higher financing costs can slow starts and extend decision cycles.",
        severity: "watch",
      });
    } else if (mortgageDelta < -0.05) {
      alerts.push({
        title: "Mortgage rates easing",
        why_it_matters: "Lower financing costs can improve affordability and project viability.",
        severity: "monitor",
      });
    }
  }

  if (cpiDelta !== null && cpiDelta > 0) {
    alerts.push({
      title: "Inflation ticked up",
      why_it_matters: "Inflation pressure can keep rates higher for longer and raise input costs.",
      severity: "monitor",
    });
  }

  if (unrateDelta !== null && unrateDelta > 0) {
    alerts.push({
      title: "Unemployment rising",
      why_it_matters: "Cooling labor conditions can signal demand softening and slower growth.",
      severity: "info",
    });
  }

  return alerts;
}

function buildDeepAnalysis({ mortgageDelta, cpiDelta, unrateDelta }) {
  const bullets = [];
  if (mortgageDelta !== null)
    bullets.push(`Mortgage rate delta: ${mortgageDelta >= 0 ? "+" : ""}${mortgageDelta.toFixed(2)} pts`);
  if (cpiDelta !== null)
    bullets.push(`CPI delta: ${cpiDelta >= 0 ? "+" : ""}${cpiDelta.toFixed(2)}`);
  if (unrateDelta !== null)
    bullets.push(`Unemployment delta: ${unrateDelta >= 0 ? "+" : ""}${unrateDelta.toFixed(2)} pts`);

  return {
    what_changed: bullets.length ? bullets.join(" • ") : "Insufficient delta data for change summary.",
    what_to_do_next: [
      "Monitor financing conditions and bid discipline on long-duration projects.",
      "Watch CPI trend for rate path implications.",
      "Prioritize backlog quality and renegotiate risk clauses where possible.",
    ],
  };
}

// --- FRED call ---
async function fredObservations(seriesId) {
  const url = new URL("https://api.stlouisfed.org/fred/series/observations");
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("series_id", seriesId);
  url.searchParams.set("observation_start", OBS_START);

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": "Construction-AI Dashboard Builder" },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`FRED error (${seriesId}) ${res.status}: ${text}`);
  }
  return await res.json();
}

// --- Build dashboard JSON ---
function buildDashboard({ mortgage, cpi, unrate, houst, permit }) {
  const mortgageHistory = normalizeHistory(mortgage);
  const cpiHistory = normalizeHistory(cpi);
  const unrateHistory = normalizeHistory(unrate);
  const houstHistory = normalizeHistory(houst);
  const permitHistory = normalizeHistory(permit);

  const m = lastTwoValues(mortgageHistory);
  const c = lastTwoValues(cpiHistory);
  const u = lastTwoValues(unrateHistory);

  // pressure_index uses primary series latest value (stable + matches your UI)
  const pressureIndex = roundTo(m.last, 2);
  const band = bandFromPressureIndex(pressureIndex);

  const alerts = buildAlerts({
    mortgageDelta: m.delta,
    cpiDelta: c.delta,
    unrateDelta: u.delta,
  });

  return {
    version: 1,
    generated_at: new Date().toISOString(),

    executive: {
      headline: "Mortgage rates: watch for continued pressure",
      confidence: "Medium",
      summary: "Auto-updated from FRED every run.",
    },

    capital: {
      pressure_index: pressureIndex,
      band,
      history: mortgageHistory,
    },

    signals: [
      { name: "30Y Mortgage Rate", region: "US", yoy: null, units: "%", history: mortgageHistory },
      { name: "CPI (All Urban Consumers)", region: "US", yoy: null, units: "index", history: cpiHistory },
      { name: "Unemployment Rate", region: "US", yoy: null, units: "%", history: unrateHistory },
      { name: "Housing Starts", region: "US", yoy: null, units: "thousands", history: houstHistory },
      { name: "Building Permits", region: "US", yoy: null, units: "thousands", history: permitHistory },
    ],

    alerts,
    deep_analysis: buildDeepAnalysis({
      mortgageDelta: m.delta,
      cpiDelta: c.delta,
      unrateDelta: u.delta,
    }),
  };
}

// --- Main ---
(async () => {
  const [mortgageData, cpiData, unrateData, houstData, permitData] = await Promise.all([
    fredObservations(SERIES_ID),
    fredObservations(CPI_SERIES_ID),
    fredObservations(UNRATE_SERIES_ID),
    fredObservations(HOUST_SERIES_ID),
    fredObservations(PERMIT_SERIES_ID),
  ]);

  const dashboard = buildDashboard({
    mortgage: Array.isArray(mortgageData.observations) ? mortgageData.observations : [],
    cpi: Array.isArray(cpiData.observations) ? cpiData.observations : [],
    unrate: Array.isArray(unrateData.observations) ? unrateData.observations : [],
    houst: Array.isArray(houstData.observations) ? houstData.observations : [],
    permit: Array.isArray(permitData.observations) ? permitData.observations : [],
  });

  fs.writeFileSync(OUT_PATH, JSON.stringify(dashboard, null, 2), "utf8");
  console.log(`Wrote ${OUT_PATH} (primary=${SERIES_ID})`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
