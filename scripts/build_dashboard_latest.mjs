// scripts/build_dashboard_latest.mjs
      - name: Build dashboard_latest.json
        env:
          FRED_API_KEY: ${{ secrets.FRED_API_KEY }}
          FRED_SERIES_ID: ${{ github.event.inputs.series_id || 'MORTGAGE30US' }}
          FRED_CPI_SERIES_ID: CPIAUCSL
          FRED_OBSERVATION_START: ${{ github.event.inputs.observation_start || '2020-01-01' }}
          OUT_PATH: dashboard_latest.json
        run: node scripts/build_dashboard_latest.mjs

import fs from "fs";

const API_KEY = process.env.FRED_API_KEY;

const SERIES_ID = process.env.FRED_SERIES_ID || "MORTGAGE30US";
const CPI_SERIES_ID = process.env.FRED_CPI_SERIES_ID || "CPIAUCSL";

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
    throw new Error(`FRED request failed (${res.status}): ${text}`);
  }
  return res.json();
}

function cleanHistory(observations) {
  return observations
    .map(o => ({ date: o.date, value: toNumberSafe(o.value) }))
    .filter(x => x.value !== null);
}

function lastValue(history) {
  if (!history.length) return null;
  return history[history.length - 1];
}

// Find closest value to ~1 year earlier (works for weekly/monthly series)
function yoyPercent(history) {
  if (history.length < 2) return null;

  const latest = history[history.length - 1];
  const latestDate = new Date(latest.date);
  if (Number.isNaN(latestDate.getTime())) return null;

  const target = new Date(latestDate);
  target.setFullYear(target.getFullYear() - 1);
  const targetMs = target.getTime();

  // Pick the history point with date closest to target
  let best = null;
  let bestDiff = Infinity;

  for (const p of history) {
    const d = new Date(p.date);
    const ms = d.getTime();
    if (Number.isNaN(ms)) continue;
    const diff = Math.abs(ms - targetMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = p;
    }
  }

  if (!best || best.value === 0) return null;
  return ((latest.value / best.value) - 1) * 100;
}

function bandFromPressureIndex(value) {
  if (value === null) return "Unknown";
  if (value >= 7) return "Restrictive";
  if (value >= 5) return "Tight";
  return "Neutral";
}

function buildDashboard({ mortgageHistory, cpiHistory }) {
  const mortgageLatest = lastValue(mortgageHistory);
  const mortgageLatestValue = mortgageLatest ? mortgageLatest.value : null;

  const pressureIndex = roundTo(mortgageLatestValue, 2);
  const band = bandFromPressureIndex(pressureIndex);

  const mortgageYoY = yoyPercent(mortgageHistory);
  const cpiYoY = yoyPercent(cpiHistory);

  const cpiLatest = lastValue(cpiHistory);

  return {
    version: 1,
    generated_at: new Date().toISOString(),

    executive: {
      headline: "Mortgage rates: watch for continued pressure",
      confidence: "Medium",
      summary: "Auto-updated from FRED every run."
    },

    // Capital Pressure Index = mortgage series (simple + stable)
    capital: {
      pressure_index: pressureIndex,
      band,
      history: mortgageHistory
    },

    // Add CPI section (your choice “1”)
    cpi: {
      value: cpiLatest ? roundTo(cpiLatest.value, 2) : null,
      yoy: cpiYoY === null ? null : roundTo(cpiYoY, 2),
      units: "index",
      date: cpiLatest ? cpiLatest.date : null,
      history: cpiHistory
    },

    signals: [
      {
        name: "30Y Mortgage Rate",
        region: "US",
        yoy: mortgageYoY === null ? null : roundTo(mortgageYoY, 2),
        units: "%",
        history: mortgageHistory
      },
      {
        name: "CPI (All Urban Consumers)",
        region: "US",
        yoy: cpiYoY === null ? null : roundTo(cpiYoY, 2),
        units: "index",
        history: cpiHistory
      }
    ],

    alerts: []
  };
}

(async () => {
  const mortgageRaw = await fredObservations(SERIES_ID, OBS_START);
  const cpiRaw = await fredObservations(CPI_SERIES_ID, OBS_START);

  const mortgageObs = Array.isArray(mortgageRaw.observations) ? mortgageRaw.observations : [];
  const cpiObs = Array.isArray(cpiRaw.observations) ? cpiRaw.observations : [];

  const mortgageHistory = cleanHistory(mortgageObs);
  const cpiHistory = cleanHistory(cpiObs);

  const dashboard = buildDashboard({ mortgageHistory, cpiHistory });

  fs.writeFileSync(OUT_PATH, JSON.stringify(dashboard, null, 2), "utf8");
  console.log(
    `Wrote ${OUT_PATH} using series_id=${SERIES_ID} (${mortgageHistory.length}) and CPI=${CPI_SERIES_ID} (${cpiHistory.length})`
  );
})();
