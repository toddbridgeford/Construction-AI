// =====================================================
// Construction-AI Institutional Builder
// scripts/build_dashboard_latest.mjs
//
// ✅ Safe JSON read/write (no string splicing)
// ✅ Optional merge: config/public_market_snapshot.json
// ✅ Adds: schema_version 3.1.0, market_overview, sector averages,
//    CEPS score, correlations, risk_mode, volatility_regime
// =====================================================

import fs from "fs";

// ----------------------------
// Utilities
// ----------------------------
function avg(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return 0;
  const nums = arr.map(n => (Number.isFinite(n) ? n : 0));
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function clamp(num, min, max) {
  return Math.max(min, Math.min(max, num));
}

function correlation(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return 0;
  if (a.length !== b.length || a.length < 2) return 0;

  const meanA = avg(a);
  const meanB = avg(b);

  let numerator = 0;
  let denomA = 0;
  let denomB = 0;

  for (let i = 0; i < a.length; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    numerator += da * db;
    denomA += da * da;
    denomB += db * db;
  }

  return denomA && denomB ? numerator / Math.sqrt(denomA * denomB) : 0;
}

function readJsonSafe(path, fallback = null) {
  try {
    const txt = fs.readFileSync(path, "utf8");
    return JSON.parse(txt);
  } catch (e) {
    return fallback;
  }
}

function writeJsonAtomic(path, obj) {
  const tmp = `${path}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, path);
}

function normalizeNumber(v) {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const d = Number(v);
    return Number.isFinite(d) ? d : null;
  }
  // supports { value: 12.3 } shapes
  if (typeof v === "object" && v && "value" in v) {
    return normalizeNumber(v.value);
  }
  return null;
}

function ensurePanels(raw) {
  if (!raw.panels || typeof raw.panels !== "object") raw.panels = {};
  if (!raw.panels.public_market || typeof raw.panels.public_market !== "object") {
    raw.panels.public_market = { mode: "manual_snapshot", as_of: null, rows: [] };
  }
  if (!Array.isArray(raw.panels.public_market.rows)) raw.panels.public_market.rows = [];
}

// ----------------------------
// Load dashboard_latest.json (must be valid JSON)
// ----------------------------
const DASH_PATH = "dashboard_latest.json";
const raw = readJsonSafe(DASH_PATH);

if (!raw) {
  console.error(`FATAL: ${DASH_PATH} is missing or invalid JSON.`);
  process.exit(1);
}

raw.schema_version = "3.1.0";

// ----------------------------
// Merge public market snapshot (optional)
// File: config/public_market_snapshot.json
// Shape:
// { "version":1, "asof":"YYYY-MM-DD", "rows":[{ticker,...}] }
// ----------------------------
const SNAP_PATH = "config/public_market_snapshot.json";
const snap = readJsonSafe(SNAP_PATH, null);

ensurePanels(raw);

if (snap && Array.isArray(snap.rows)) {
  const asOf = snap.asof ?? snap.as_of ?? null;

  // Merge by ticker, prefer non-null values from snapshot if dashboard row is missing them.
  const existing = raw.panels.public_market.rows || [];
  const byTicker = new Map();

  for (const r of existing) {
    if (r && r.ticker) byTicker.set(String(r.ticker).toUpperCase(), { ...r });
  }

  for (const s of snap.rows) {
    if (!s || !s.ticker) continue;
    const key = String(s.ticker).toUpperCase();

    const prev = byTicker.get(key) || { ticker: key };

    const merged = {
      ticker: key,
      company_name: prev.company_name ?? s.company_name ?? s.companyName ?? null,
      subsector: prev.subsector ?? s.subsector ?? null,

      // allow both naming conventions
      price_change_1w:
        prev.price_change_1w ?? s.price_change_1w ?? s.chg1w ?? null,
      price_change_1m:
        prev.price_change_1m ?? s.price_change_1m ?? s.chg1m ?? null,
      price_change_ytd:
        prev.price_change_ytd ?? s.price_change_ytd ?? s.chgYtd ?? null,

      signal_flag: prev.signal_flag ?? s.signal_flag ?? null,
    };

    byTicker.set(key, merged);
  }

  raw.panels.public_market.mode = "manual_snapshot";
  raw.panels.public_market.as_of = asOf;
  raw.panels.public_market.rows = Array.from(byTicker.values());

  // Optional: keep rows stable-sorted by subsector then ticker
  raw.panels.public_market.rows.sort((a, b) => {
    const sa = (a.subsector || "GENERAL").toUpperCase();
    const sb = (b.subsector || "GENERAL").toUpperCase();
    if (sa < sb) return -1;
    if (sa > sb) return 1;
    return String(a.ticker).localeCompare(String(b.ticker));
  });
}

// ----------------------------
// MARKET OVERVIEW (stubbed until a feed is wired)
// ----------------------------
raw.market_overview = {
  indices: [
    { ticker: "DOW", name: "Dow Jones", last: 39241.55, chg_pct: 0.77 },
    { ticker: "SPX", name: "S&P 500", last: 5188.12, chg_pct: 0.80 },
    { ticker: "IXIC", name: "Nasdaq", last: 16422.4, chg_pct: 1.15 },
    { ticker: "RUT", name: "Russell 2000", last: 2063.22, chg_pct: 1.51 },
    { ticker: "VIX", name: "Volatility Index", last: 18.22, chg_pct: -3.22 },
    { ticker: "US10Y", name: "US 10Y Yield", last: 4.21, chg_bps: 4 },
  ],
};

// ----------------------------
// Sector Averages (from public_market.rows)
// ----------------------------
const rows = raw?.panels?.public_market?.rows || [];
const grouped = {};

for (const r of rows) {
  const sector = String((r.subsector || "GENERAL")).trim() || "GENERAL";
  if (!grouped[sector]) grouped[sector] = [];
  grouped[sector].push(r);
}

const sectorAverages = Object.keys(grouped).map((sector) => {
  const list = grouped[sector];

  return {
    sector,
    avg_1w: avg(list.map((r) => normalizeNumber(r.price_change_1w) ?? 0)),
    avg_1m: avg(list.map((r) => normalizeNumber(r.price_change_1m) ?? 0)),
    avg_ytd: avg(list.map((r) => normalizeNumber(r.price_change_ytd) ?? 0)),
  };
});

raw.construction_equity = { sector_averages: sectorAverages };

// ----------------------------
// CEPS — Construction Equity Pressure Score
// ----------------------------
const findSector = (keyword) =>
  sectorAverages.find((s) => String(s.sector).toLowerCase().includes(keyword)) || {
    avg_1w: 0,
  };

const builders = findSector("home");
const materials = findSector("material");
const distributors = findSector("distributor");

const avgBuilders1W = normalizeNumber(builders.avg_1w) ?? 0;
const avgMaterials1W = normalizeNumber(materials.avg_1w) ?? 0;
const avgDistributors1W = normalizeNumber(distributors.avg_1w) ?? 0;

// CPI history normalization (supports {date,value} where value could be number/string/{value})
const cpiHistRaw = Array.isArray(raw.capital?.history) ? raw.capital.history : [];
const cpiHistory = cpiHistRaw.map((h) => normalizeNumber(h?.value) ?? 0);

const cpiDelta =
  cpiHistory.length >= 2 ? cpiHistory[cpiHistory.length - 1] - cpiHistory[cpiHistory.length - 2] : 0;

const tenYearMove =
  raw.market_overview.indices.find((i) => i.ticker === "US10Y")?.chg_bps ?? 0;

let ceps =
  avgBuilders1W * 0.3 +
  avgDistributors1W * 0.2 +
  avgMaterials1W * 0.2 +
  cpiDelta * 0.15 +
  tenYearMove * 0.15;

ceps = clamp(Math.round(50 + ceps), 0, 100);
raw.ceps_score = ceps;

// ----------------------------
// Correlation Engine
// ----------------------------
const builderHistory = rows
  .filter((r) => String(r.subsector || "").toLowerCase().includes("home"))
  .map((r) => normalizeNumber(r.price_change_1m) ?? 0);

const alignedLen = Math.min(cpiHistory.length, builderHistory.length);
const corr =
  alignedLen >= 2
    ? correlation(cpiHistory.slice(-alignedLen), builderHistory.slice(-alignedLen))
    : 0;

raw.correlations = {
  cpi_vs_builders: corr,
  regime: ceps >= 70 ? "TIGHTENING" : ceps <= 30 ? "EASING" : "NEUTRAL",
};

// ----------------------------
// Risk Mode v2
// ----------------------------
const vix = raw.market_overview.indices.find((i) => i.ticker === "VIX")?.last ?? 0;
const cpiValue = raw.capital?.pressure_index ?? raw.capital?.pressureIndex ?? 0;

raw.risk_mode = Boolean(cpiValue >= 70 || avgBuilders1W <= -5 || vix >= 25);

// ----------------------------
// Volatility Regime
// ----------------------------
raw.volatility_regime = vix >= 30 ? "HIGH" : vix >= 20 ? "ELEVATED" : "NORMAL";

// ----------------------------
// Write dashboard_latest.json (valid JSON, always)
// ----------------------------
writeJsonAtomic(DASH_PATH, raw);
console.log("Institutional Bloomberg build complete.");
