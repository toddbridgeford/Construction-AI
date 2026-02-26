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

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`FRED request failed (${res.status}): ${text}`);
  }
  return res.json();
}

function isoNow() {
  return new Date().toISOString();
}

function pickLatest(obsArray) {
  if (!Array.isArray(obsArray) || obsArray.length === 0) return null;
  return obsArray[obsArray.length - 1];
}

function buildHistory(obsArray) {
  if (!Array.isArray(obsArray)) return [];
  return obsArray
    .map((o) => ({
      date: o.date,
      value: toNumberSafe(o.value),
    }))
    .filter((x) => x.value !== null);
}

(async () => {
  try {
    const data = await fredObservations();
    const obs = data.observations || [];
    const history = buildHistory(obs);
    const latest = pickLatest(history);
    const latestValue = latest ? latest.value : null;

    const dashboard = {
      version: 1,
      generated_at: isoNow(),
      executive: {
        headline: "Mortgage rates: watch for continued pressure",
        confidence: "Medium",
        summary: "Auto-updated from FRED every run.",
      },
      capital: {
        pressure_index: roundTo(latestValue, 2),
        band: "Restrictive",
        history,
      },
      signals: [
        {
          name: "30Y Mortgage Rate",
          region: "US",
          yoy: null,
          units: "%",
          history,
        },
      ],
    };

    fs.writeFileSync(OUT_PATH, JSON.stringify(dashboard, null, 2), "utf8");
    console.log(`Wrote ${OUT_PATH} (${history.length} points) from ${SERIES_ID}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
