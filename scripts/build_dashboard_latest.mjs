// =====================================================
// Construction-AI Bloomberg Mode Builder
// Schema v3.1.0
// =====================================================

import fs from "fs";

// -----------------------------------------------------
// Helpers
// -----------------------------------------------------

function avg(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function clamp(num, min, max) {
  return Math.max(min, Math.min(max, num));
}

// -----------------------------------------------------
// Load existing dashboard
// -----------------------------------------------------

const filePath = "dashboard_latest.json";
const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));

// Upgrade schema version
raw.schema_version = "3.1.0";

// -----------------------------------------------------
// MARKET OVERVIEW (Placeholder logic – wire real feeds later)
// -----------------------------------------------------

raw.market_overview = {
  indices: [
    {
      ticker: "DOW",
      name: "Dow Jones Industrial Avg",
      last: 39241.55,
      chg_pct: 0.77
    },
    {
      ticker: "SPX",
      name: "S&P 500",
      last: 5188.12,
      chg_pct: 0.80
    },
    {
      ticker: "IXIC",
      name: "Nasdaq",
      last: 16422.40,
      chg_pct: 1.15
    },
    {
      ticker: "RUT",
      name: "Russell 2000",
      last: 2063.22,
      chg_pct: 1.51
    },
    {
      ticker: "VIX",
      name: "Volatility Index",
      last: 18.22,
      chg_pct: -3.22
    },
    {
      ticker: "US10Y",
      name: "US 10Y Yield",
      last: 4.21,
      chg_bps: 4
    }
  ]
};

// -----------------------------------------------------
// Construction Equity Sector Averages
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
// CEPS – Construction Equity Pressure Score
// -----------------------------------------------------

const builders = sectorAverages.find(s =>
  s.sector.toLowerCase().includes("home")
);

const materials = sectorAverages.find(s =>
  s.sector.toLowerCase().includes("material")
);

const distributors = sectorAverages.find(s =>
  s.sector.toLowerCase().includes("distributor")
);

const avgBuilders1W = builders?.avg_1w || 0;
const avgMaterials1W = materials?.avg_1w || 0;
const avgDistributors1W = distributors?.avg_1w || 0;

const cpiDelta =
  (raw.capital?.history?.length >= 2)
    ? raw.capital.history.slice(-1)[0].value -
      raw.capital.history.slice(-2)[0].value
    : 0;

const tenYearMove =
  raw.market_overview.indices.find(i => i.ticker === "US10Y")?.chg_bps || 0;

// Weighted composite
let ceps =
  (avgBuilders1W * 0.30) +
  (avgDistributors1W * 0.20) +
  (avgMaterials1W * 0.20) +
  (cpiDelta * 0.15) +
  (tenYearMove * 0.15);

// Normalize 0–100
ceps = clamp(Math.round(50 + ceps), 0, 100);

raw.ceps_score = ceps;

// -----------------------------------------------------
// Risk Mode Logic
// -----------------------------------------------------

const vix =
  raw.market_overview.indices.find(i => i.ticker === "VIX")?.last || 0;

const cpiValue = raw.capital?.pressure_index || 0;

raw.risk_mode =
  (cpiValue >= 70) ||
  (avgBuilders1W <= -5) ||
  (vix >= 25);

// -----------------------------------------------------
// Write File
// -----------------------------------------------------

fs.writeFileSync(filePath, JSON.stringify(raw, null, 2));

console.log("Bloomberg mode dashboard built successfully.");
