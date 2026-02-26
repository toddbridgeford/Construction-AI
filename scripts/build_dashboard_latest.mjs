// scripts/build_dashboard_latest.mjs
import fs from "fs";

const API_KEY = process.env.FRED_API_KEY;

// Primary signal (you pass this from the workflow input)
const SERIES_ID = process.env.FRED_SERIES_ID || "MORTGAGE30US";

// Additional signals (set in workflow env)
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

function toNumberSafe(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function roundTo(n, decimals = 2) {
  if (n === null) return null;
  const p = Math.pow(10, decimals);
  return Math.round(n * p) / p;
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
    throw new Error(`FRED request failed (${res.status}) for ${seriesId}: ${text}`);
  }
  return res.json();
}

function normalizeHistory(observations) {
  return observations
    .map(o => ({ date: o.date, value: toNumberSafe(o.value) }))
    .filter(x => x.value !== null);
}

function lastTwoValues(history) {
  if (!history || history.length < 2) return { prev: null, last: null, delta: null };
  const last = history[history.length - 1].value;
  const prev = history[history.length - 2].value;
  const delta = last - prev;
  return { prev, last, delta };
}

function bandFromPressureIndex(value) {
  // Keep simple + stable. You can refine later.
  if (value === null) return "Unknown";
  if (value >= 7) return "Restrictive";
  if (value >= 5) return "Tight";
  if (value >= 3) return "Neutral";
  return "Easy";
}

function buildAlerts({ mortgageDelta, cpiDelta, unrateDelta }) {
  const alerts = [];

  // Mortgage delta
  if (mortgageDelta !== null) {
    if (mortgageDelta >= 0.10) {
      alerts.push({
        title: "Mortgage rates ticking up",
        why_it_matters: "Higher financing costs can slow starts and increase project cancellations.",
        severity: "watch"
      });
    } else if (mortgageDelta <= -0.10) {
      alerts.push({
        title: "Mortgage rates easing",
        why_it_matters: "Improving affordability can support demand and developer confidence.",
        severity: "info"
      });
    }
  }

  // CPI delta (monthly series, bigger numbers)
  if (cpiDelta !== null) {
    if (cpiDelta >= 0.4) {
      alerts.push({
        title: "Inflation pressure rising",
        why_it_matters: "Persistent inflation can keep rates higher for longer and pressure margins.",
        severity: "monitor"
      });
    } else if (cpiDelta <= 0) {
      alerts.push({
        title: "Inflation not accelerating",
        why_it_matters: "Cooling inflation can reduce rate pressure over time.",
        severity: "info"
      });
    }
  }

  // Unemployment delta
  if (unrateDelta !== null) {
    if (unrateDelta >= 0.2) {
      alerts.push({
        title: "Labor market softening",
        why_it_matters: "Rising unemployment can weaken demand and slow project pipelines.",
        severity: "monitor"
      });
    }
  }

  // Keep it tight: max 3 alerts
  return alerts.slice(0, 3);
}

function buildDeepAnalysis({ mortgageDelta, cpiDelta, unrateDelta }) {
  const bullets = [];
  if (mortgageDelta !== null) bullets.push(`Mortgage rate delta: ${mortgageDelta >= 0 ? "+" : ""}${mortgageDelta.toFixed(2)} pts`);
  if (cpiDelta !== null) bullets.push(`CPI delta: ${cpiDelta >= 0 ? "+" : ""}${cpiDelta.toFixed(2)}`);
  if (unrateDelta !== null) bullets.push(`Unemployment delta: ${unrateDelta >= 0 ? "+" : ""}${unrateDelta.toFixed(2)} pts`);

  return {
    what_changed: bullets.length ? bullets.join(" • ") : "Insufficient delta data for change summary.",
    what_to_do_next: [
      "Monitor financing conditions and bid discipline on long-duration projects.",
      "Watch CPI trend for rate path implications.",
      "Prioritize backlog quality and renegotiate risk clauses where possible."
    ]
  };
}

function buildDashboard({ mortgage, cpi, unrate, houst, permit }) {
  const mortgageHistory = normalizeHistory(mortgage);
  const cpiHistory = normalizeHistory(cpi);
  const unrateHistory = normalizeHistory(unrate);
  const houstHistory = normalizeHistory(houst);
  const permitHistory = normalizeHistory(permit);

  const m = lastTwoValues(mortgageHistory);
  const c = lastTwoValues(cpiHistory);
  const u = lastTwoValues(unrateHistory);

  // For now: pressure_index uses the primary (mortgage) latest value (matches your current UI)
  const pressureIndex = roundTo(m.last, 2);
  const band = bandFromPressureIndex(pressureIndex);

  const alerts = buildAlerts({
    mortgageDelta: m.delta,
    cpiDelta: c.delta,
    unrateDelta: u.delta
  });

  return {
    version: 1,
    generated_at: new Date().toISOString(),

    executive: {
      headline: "Mortgage rates: watch for continued pressure",
      confidence: "Medium",
      summary: "Auto-updated from FRED every run."
    },

    capital: {
      pressure_index: pressureIndex,
      band,
      history: mortgageHistory
    },

    signals: [
      {
        name: "30Y Mortgage Rate",
        region: "US",
        yoy: null,
        units: "%",
        history: mortgageHistory
      },
      {
        name: "CPI (All Urban Consumers)",
        region: "US",
        yoy: null,
        units: "index",
        history: cpiHistory
      },
      {
        name: "Unemployment Rate",
        region: "US",
        yoy: null,
        units: "%",
        history: unrateHistory
      },
      {
        name: "Housing Starts",
        region: "US",
        yoy: null,
        units: "thousands",
        history: houstHistory
      },
      {
        name: "Building Permits",
        region: "US",
        yoy: null,
        units: "thousands",
        history: permitHistory
      }
    ],

    alerts,
    deep_analysis: buildDeepAnalysis({
      mortgageDelta: m.delta,
      cpiDelta: c.delta,
      unrateDelta: u.delta
    })
  };
}

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
})();
