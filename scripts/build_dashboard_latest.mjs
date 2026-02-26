// scripts/build_dashboard_latest.mjs
import fs from "fs";

const SERIES_ID = process.env.FRED_SERIES_ID || "MORTGAGE30US";
const API_KEY = process.env.FRED_API_KEY;
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

async function fredObservations() {
  const url = new URL("https://api.stlouisfed.org/fred/series/observations");
  url.searchParams.set("series_id", SERIES_ID);
  url.searchParams.set("api_key", API_KEY);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("sort_order", "asc");
  url.searchParams.set("observation_start", OBS_START);

  const res = await fetch(url.toString(), { headers: { "Accept": "application/json" } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`FRED request failed (${res.status}): ${text}`);
  }
  return res.json();
}

function lastNonNullObservation(obs) {
  for (let i = obs.length - 1; i >= 0; i--) {
    const v = toNumberSafe(obs[i].value);
    if (v !== null) return { date: obs[i].date, value: v };
  }
  return null;
}

function bandFromPressureIndex(value) {
  // Simple placeholder: you can refine later.
  if (value === null) return "Unknown";
  if (value >= 7) return "Restrictive";
  if (value >= 5) return "Tight";
  return "Neutral";
}

function buildDashboard(observations) {
  const history = observations.map(o => ({
    date: o.date,
    value: toNumberSafe(o.value),
  })).filter(x => x.value !== null);

  const latest = lastNonNullObservation(observations);
  const latestValue = latest ? latest.value : null;

  const pressureIndex = roundTo(latestValue, 2);
  const band = bandFromPressureIndex(pressureIndex);

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
      history
    },

    signals: [
      {
        name: "30Y Mortgage Rate",
        region: "US",
        yoy: null,
        units: "%",
        history
      }
    ],

    alerts: []
  };
}

(async () => {
  const data = await fredObservations();
  const observations = Array.isArray(data.observations) ? data.observations : [];

  const dashboard = buildDashboard(observations);

  fs.writeFileSync(OUT_PATH, JSON.stringify(dashboard, null, 2), "utf8");
  console.log(`Wrote ${OUT_PATH} using series_id=${SERIES_ID} (${observations.length} observations)`);
})();
