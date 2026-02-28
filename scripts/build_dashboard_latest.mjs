// =====================================================
// Construction-AI Institutional Builder
// Schema v3.1.0 — Full Bloomberg Mode
// =====================================================

import fs from "fs";

// -----------------------------------------------------
// Utilities
// -----------------------------------------------------

function avg(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function clamp(num, min, max) {
  return Math.max(min, Math.min(max, num));
}

function correlation(a, b) {
  if (!a || !b || a.length !== b.length || a.length < 2) return 0;
  const meanA = avg(a);
  const meanB = avg(b);

  let numerator = 0;
  let denomA = 0;
  let denomB = 0;

  for (let i = 0; i < a.length; i++) {
    numerator += (a[i] - meanA) * (b[i] - meanB);
    denomA += Math.pow(a[i] - meanA, 2);
    denomB += Math.pow(b[i] - meanB, 2);
  }

  return denomA && denomB ? numerator / Math.sqrt(denomA * denomB) : 0;
}

// -----------------------------------------------------
// Load dashboard
// -----------------------------------------------------

const path = "dashboard_latest.json";
const raw = JSON.parse(fs.readFileSync(path, "utf8"));

raw.schema_version = "3.1.0";

// -----------------------------------------------------
// MARKET OVERVIEW (stubbed values – wire to feed later)
// -----------------------------------------------------

raw.market_overview = {
  indices: [
    { ticker: "DOW",  name: "Dow Jones", last: 39241.55, chg_pct: 0.77 },
    { ticker: "SPX",  name: "S&P 500", last: 5188.12, chg_pct: 0.80 },
    { ticker: "IXIC", name: "Nasdaq", last: 16422.40, chg_pct: 1.15 },
    { ticker: "RUT",  name: "Russell 2000", last: 2063.22, chg_pct: 1.51 },
    { ticker: "VIX",  name: "Volatility Index", last: 18.22, chg_pct: -3.22 },
    { ticker: "US10Y", name: "US 10Y Yield", last: 4.21, chg_bps: 4 }
  ]
};

// -----------------------------------------------------
// Sector Averages
// -----------------------------------------------------

const rows = raw?.panels?.public_market?.rows || [];
const grouped = {};

for (const r of rows) {
  const sector = (r.subsector || "GENERAL").trim();
  if (!grouped[sector]) grouped[sector] = [];
  grouped[sector].push(r);
}

const sectorAverages = Object.keys(grouped).map(sector => {
  const list = grouped[sector];

  return {
    sector,
    avg_1w: avg(list.map(r => r.price_change_1w || 0)),
    avg_1m: avg(list.map(r => r.price_change_1m || 0)),
    avg_ytd: avg(list.map(r => r.price_change_ytd || 0))
  };
});

raw.construction_equity = {
  sector_averages: sectorAverages
};

// -----------------------------------------------------
// CEPS — Construction Equity Pressure Score
// -----------------------------------------------------

const findSector = keyword =>
  sectorAverages.find(s => s.sector.toLowerCase().includes(keyword)) || { avg_1w: 0 };

const builders = findSector("home");
const materials = findSector("material");
const distributors = findSector("distributor");

const avgBuilders1W = builders.avg_1w;
const avgMaterials1W = materials.avg_1w;
const avgDistributors1W = distributors.avg_1w;

const cpiHistory = raw.capital?.history?.map(h => h.value) || [];
const cpiDelta = cpiHistory.length >= 2
  ? cpiHistory.slice(-1)[0] - cpiHistory.slice(-2)[0]
  : 0;

const tenYearMove =
  raw.market_overview.indices.find(i => i.ticker === "US10Y")?.chg_bps || 0;

let ceps =
  (avgBuilders1W * 0.30) +
  (avgDistributors1W * 0.20) +
  (avgMaterials1W * 0.20) +
  (cpiDelta * 0.15) +
  (tenYearMove * 0.15);

ceps = clamp(Math.round(50 + ceps), 0, 100);
raw.ceps_score = ceps;

// -----------------------------------------------------
// Correlation Engine
// -----------------------------------------------------

const builderHistory = rows
  .filter(r => r.subsector?.toLowerCase().includes("home"))
  .map(r => r.price_change_1m || 0);

raw.correlations = {
  cpi_vs_builders: correlation(cpiHistory.slice(-builderHistory.length), builderHistory),
  regime: ceps >= 70 ? "TIGHTENING" : ceps <= 30 ? "EASING" : "NEUTRAL"
};

// -----------------------------------------------------
// Risk Mode v2
// -----------------------------------------------------

const vix =
  raw.market_overview.indices.find(i => i.ticker === "VIX")?.last || 0;

const cpiValue = raw.capital?.pressure_index || 0;

raw.risk_mode =
  (cpiValue >= 70) ||
  (avgBuilders1W <= -5) ||
  (vix >= 25);

// -----------------------------------------------------
// Volatility Regime
// -----------------------------------------------------

raw.volatility_regime =
  vix >= 30 ? "HIGH" :
  vix >= 20 ? "ELEVATED" :
  "NORMAL";

// -----------------------------------------------------
// Write file
// -----------------------------------------------------

fs.writeFileSync(path, JSON.stringify(raw, null, 2));
console.log("Institutional Bloomberg build complete.");
