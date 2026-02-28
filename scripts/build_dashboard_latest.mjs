// =====================================================
// Construction-AI Institutional Builder
// Schema v3.1.0 — Full Bloomberg Mode (Hardened)
// =====================================================

import fs from "fs";
import path from "path";

// -----------------------------------------------------
// Paths
// -----------------------------------------------------

const ROOT = process.cwd();

// Prefer workflow env OUT_PATH, else default dashboard_latest.json
const DASH_PATH = process.env.OUT_PATH || "dashboard_latest.json";
const SNAP_PATH = "config/public_market_snapshot.json";

const dashAbs = path.resolve(ROOT, DASH_PATH);
const snapAbs = path.resolve(ROOT, SNAP_PATH);

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

function safeReadJSON(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const txt = fs.readFileSync(filePath, "utf8").trim();
    if (!txt) return {};
    return JSON.parse(txt);
  } catch (e) {
    return null;
  }
}

function safeWriteJSON(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2));
}

function normalizeTicker(t) {
  return String(t || "").trim().toUpperCase();
}

function mergePublicMarketRows(primaryRows, snapshotRows) {
  const out = [];
  const seen = new Set();

  const pushRow = (r) => {
    const t = normalizeTicker(r?.ticker);
    if (!t) return;
    if (seen.has(t)) return;
    seen.add(t);

    out.push({
      ticker: t,
      company_name: r.company_name ?? r.companyName ?? null,
      subsector: r.subsector ?? null,
      price_change_1w: r.price_change_1w ?? r.priceChange1w ?? null,
      price_change_1m: r.price_change_1m ?? r.priceChange1m ?? null,
      price_change_ytd: r.price_change_ytd ?? r.priceChangeYtd ?? null,
      signal_flag: r.signal_flag ?? r.signalFlag ?? null
    });
  };

  (primaryRows || []).forEach(pushRow);
  (snapshotRows || []).forEach(pushRow);

  return out;
}

// -----------------------------------------------------
// Load dashboard (required for merge; create new if missing)
// -----------------------------------------------------

let raw = safeReadJSON(dashAbs);
if (raw === null) {
  // if invalid JSON, rebuild clean
  console.warn("dashboard_latest.json invalid or unreadable — rebuilding clean.");
  raw = {};
}

raw.schema_version = "3.1.0";

// Guarantee required structure
raw.panels ??= {};
raw.capital ??= {};
raw.executive ??= {};
raw.market_overview ??= {};
raw.version ??= 1;
raw.asof ??= new Date().toISOString().split("T")[0];

// Ensure panels shape exists
raw.panels.public_market ??= {};
raw.panels.public_market.rows ??= [];

// -----------------------------------------------------
// Load snapshot (optional)
// Supports either:
//  A) { version, asof, rows: [...] }
//  B) direct { rows: [...] }
// -----------------------------------------------------

const snap = safeReadJSON(snapAbs);
const snapRows = snap?.rows || [];

// Merge rows
const mergedRows = mergePublicMarketRows(raw.panels.public_market.rows, snapRows);
raw.panels.public_market.rows = mergedRows;

// If snapshot has asof, surface it
if (snap?.asof) raw.panels.public_market.as_of = snap.asof;

// -----------------------------------------------------
// MARKET OVERVIEW (stubbed values – wire to feed later)
// -----------------------------------------------------

raw.market_overview = {
  indices: [
    { ticker: "DOW", name: "Dow Jones", last: 39241.55, chg_pct: 0.77 },
    { ticker: "SPX", name: "S&P 500", last: 5188.12, chg_pct: 0.80 },
    { ticker: "IXIC", name: "Nasdaq", last: 16422.40, chg_pct: 1.15 },
    { ticker: "RUT", name: "Russell 2000", last: 2063.22, chg_pct: 1.51 },
    { ticker: "VIX", name: "Volatility Index", last: 18.22, chg_pct: -3.22 },
    { ticker: "US10Y", name: "US 10Y Yield", last: 4.21, chg_bps: 4 }
  ]
};

// -----------------------------------------------------
// Sector Averages
// -----------------------------------------------------

const rows = raw?.panels?.public_market?.rows || [];
const grouped = {};

for (const r of rows) {
  const sector = String(r.subsector || "GENERAL").trim() || "GENERAL";
  if (!grouped[sector]) grouped[sector] = [];
  grouped[sector].push(r);
}

const sectorAverages = Object.keys(grouped).sort().map((sector) => {
  const list = grouped[sector];
  return {
    sector,
    avg_1w: avg(list.map((r) => Number(r.price_change_1w ?? 0) || 0)),
    avg_1m: avg(list.map((r) => Number(r.price_change_1m ?? 0) || 0)),
    avg_ytd: avg(list.map((r) => Number(r.price_change_ytd ?? 0) || 0))
  };
});

raw.construction_equity = {
  sector_averages: sectorAverages
};

// -----------------------------------------------------
// CEPS — Construction Equity Pressure Score
// -----------------------------------------------------

const findSector = (keyword) =>
  sectorAverages.find((s) => s.sector.toLowerCase().includes(keyword)) || { avg_1w: 0 };

const builders = findSector("home");
const materials = findSector("material");
const distributors = findSector("distributor");

const avgBuilders1W = builders.avg_1w;
const avgMaterials1W = materials.avg_1w;
const avgDistributors1W = distributors.avg_1w;

const cpiHistory = (raw.capital?.history || []).map((h) => Number(h.value ?? 0) || 0);
const cpiDelta = cpiHistory.length >= 2 ? (cpiHistory.at(-1) - cpiHistory.at(-2)) : 0;

const tenYearMove = raw.market_overview.indices.find((i) => i.ticker === "US10Y")?.chg_bps || 0;

let ceps =
  (avgBuilders1W * 0.30) +
  (avgDistributors1W * 0.20) +
  (avgMaterials1W * 0.20) +
  (cpiDelta * 0.15) +
  (tenYearMove * 0.15);

ceps = clamp(Math.round(50 + ceps), 0, 100);
raw.ceps_score = ceps;

// -----------------------------------------------------
// Correlation Engine (stub-safe)
// -----------------------------------------------------

const builderHistory = rows
  .filter((r) => String(r.subsector || "").toLowerCase().includes("home"))
  .map((r) => Number(r.price_change_1m ?? 0) || 0);

const corrWindow = Math.min(cpiHistory.length, builderHistory.length);

raw.correlations = {
  cpi_vs_builders: correlation(cpiHistory.slice(-corrWindow), builderHistory.slice(-corrWindow)),
  regime: ceps >= 70 ? "TIGHTENING" : ceps <= 30 ? "EASING" : "NEUTRAL"
};

// -----------------------------------------------------
// Risk Mode v2
// -----------------------------------------------------

const vix = raw.market_overview.indices.find((i) => i.ticker === "VIX")?.last || 0;
const cpiValue = Number(raw.capital?.pressure_index ?? 0) || 0;

raw.risk_mode = (cpiValue >= 70) || (avgBuilders1W <= -5) || (vix >= 25);

// -----------------------------------------------------
// Volatility Regime
// -----------------------------------------------------

raw.volatility_regime =
  vix >= 30 ? "HIGH" :
  vix >= 20 ? "ELEVATED" :
  "NORMAL";

// -----------------------------------------------------
// Write
// -----------------------------------------------------

safeWriteJSON(dashAbs, raw);
console.log("✅ Institutional Bloomberg build complete.");
console.log(`• Dashboard: ${dashAbs}`);
console.log(`• Snapshot (optional): ${snap ? snapAbs : "(missing)"} `);
console.log(`• Rows merged: ${mergedRows.length}`);
