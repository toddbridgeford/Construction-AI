// =====================================================
// Construction-AI Institutional Builder
// Schema v3.3.0 — Temporal + Shock-Aware + FRED CPI (No deps)
// =====================================================

import fs from "fs";
import path from "path";
import https from "https";

// -----------------------------------------------------
// Paths
// -----------------------------------------------------

const ROOT = process.cwd();
const DASH_PATH = process.env.OUT_PATH || "dashboard_latest.json";
const SNAP_PATH = "config/public_market_snapshot.json";
const FRED_CFG_PATH = "config/fred_signals.json";

const dashAbs = path.resolve(ROOT, DASH_PATH);
const snapAbs = path.resolve(ROOT, SNAP_PATH);
const fredCfgAbs = path.resolve(ROOT, FRED_CFG_PATH);

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

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

function daysAgoISO(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().split("T")[0];
}

function getDeltaFromHistory(history, daysBack) {
  if (!Array.isArray(history) || history.length < 2) return null;
  const targetDate = daysAgoISO(daysBack);

  // Find nearest entry on/after targetDate
  const older = history.find((h) => String(h.date) >= targetDate);
  const latest = history.at(-1);

  if (!older || !latest) return null;
  const dv = Number(latest.value ?? latest.ceps ?? 0);
  const ov = Number(older.value ?? older.ceps ?? 0);
  if (!Number.isFinite(dv) || !Number.isFinite(ov)) return null;

  return dv - ov;
}

function assertDashboardShape(obj) {
  if (!obj || typeof obj !== "object") throw new Error("Dashboard must be an object");
  if (!obj.schema_version) throw new Error("Missing schema_version");
  if (!obj.market_overview || !Array.isArray(obj.market_overview.indices)) {
    throw new Error("Missing market_overview.indices");
  }
  if (typeof obj.ceps_score !== "number") throw new Error("Missing ceps_score");
  if (!Array.isArray(obj.regime_history)) throw new Error("Missing regime_history");
  if (!obj.shock_flags) throw new Error("Missing shock_flags");
  if (!obj.capital || typeof obj.capital !== "object") throw new Error("Missing capital");
  if (typeof obj.capital.pressure_index !== "number") throw new Error("Missing capital.pressure_index");
  if (!Array.isArray(obj.capital.history)) throw new Error("Missing capital.history");
}

// -----------------------------------------------------
// Minimal HTTPS JSON fetch (no deps)
// -----------------------------------------------------

function httpsGetJSON(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            resolve(json);
          } catch (e) {
            reject(new Error("Invalid JSON response"));
          }
        });
      })
      .on("error", (err) => reject(err));
  });
}

// -----------------------------------------------------
// FRED helpers
// -----------------------------------------------------

async function fetchFredSeriesObservations({ seriesId, apiKey, observationStart }) {
  const base = "https://api.stlouisfed.org/fred/series/observations";
  const params = new URLSearchParams({
    series_id: seriesId,
    api_key: apiKey,
    file_type: "json",
    observation_start: observationStart || "2020-01-01"
  });
  const url = `${base}?${params.toString()}`;
  const json = await httpsGetJSON(url);
  const obs = Array.isArray(json?.observations) ? json.observations : [];

  // Keep only numeric values
  return obs
    .map((o) => ({ date: o.date, value: Number(o.value) }))
    .filter((o) => o.date && Number.isFinite(o.value));
}

// Score mapping: convert YoY % change (or level delta) to 0–100 pressure
function scoreFromYoY(pctYoY, { midpoint = 0, scale = 2.5, invert = false } = {}) {
  // Simple logistic-ish clamp without dependencies
  // pctYoY near midpoint -> ~50, higher -> >50 (unless invert)
  const x = (pctYoY - midpoint) / scale;
  let s = 50 + x * 10; // linear slope
  if (invert) s = 100 - s;
  return clamp(Math.round(s), 0, 100);
}

function yoyPct(series) {
  if (!Array.isArray(series) || series.length < 13) return null;
  const latest = series.at(-1);
  const yearAgo = series.at(-13);
  if (!latest || !yearAgo) return null;
  const lv = Number(latest.value);
  const yv = Number(yearAgo.value);
  if (!Number.isFinite(lv) || !Number.isFinite(yv) || yv === 0) return null;
  return ((lv - yv) / yv) * 100;
}

function latestLevel(series) {
  if (!Array.isArray(series) || series.length < 1) return null;
  const lv = Number(series.at(-1)?.value);
  return Number.isFinite(lv) ? lv : null;
}

// -----------------------------------------------------
// Load dashboard (merge; create new if missing)
// -----------------------------------------------------

let raw = safeReadJSON(dashAbs);
if (raw === null) {
  console.warn("dashboard_latest.json invalid or unreadable — rebuilding clean.");
  raw = {};
}

raw.schema_version = "3.3.0";

// Required structure
raw.panels ??= {};
raw.capital ??= {};
raw.executive ??= {};
raw.market_overview ??= {};
raw.version ??= 1;
raw.asof ??= todayISO();

raw.regime_history ??= [];

// Panels
raw.panels.public_market ??= {};
raw.panels.public_market.rows ??= [];

// -----------------------------------------------------
// Load snapshot (required)
// -----------------------------------------------------

const snap = safeReadJSON(snapAbs);
if (snap === null) throw new Error("config/public_market_snapshot.json missing or invalid JSON");
const snapRows = snap?.rows || [];

const mergedRows = mergePublicMarketRows(raw.panels.public_market.rows, snapRows);
raw.panels.public_market.rows = mergedRows;
raw.panels.public_market.as_of = snap?.asof || raw.asof;

// -----------------------------------------------------
// MARKET OVERVIEW (still stubbed — deterministic)
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

const vix = raw.market_overview.indices.find((i) => i.ticker === "VIX")?.last || 0;
const tenYearMove = raw.market_overview.indices.find((i) => i.ticker === "US10Y")?.chg_bps || 0;

// -----------------------------------------------------
// Sector Averages + Builder Momentum Index (BMI)
// -----------------------------------------------------

const rows = raw?.panels?.public_market?.rows || [];
const grouped = {};

for (const r of rows) {
  const sector = String(r.subsector || "GENERAL").trim() || "GENERAL";
  if (!grouped[sector]) grouped[sector] = [];
  grouped[sector].push(r);
}

const sectorAverages = Object.keys(grouped)
  .sort()
  .map((sector) => {
    const list = grouped[sector];
    return {
      sector,
      avg_1w: avg(list.map((r) => Number(r.price_change_1w ?? 0) || 0)),
      avg_1m: avg(list.map((r) => Number(r.price_change_1m ?? 0) || 0)),
      avg_ytd: avg(list.map((r) => Number(r.price_change_ytd ?? 0) || 0))
    };
  });

raw.construction_equity = { sector_averages: sectorAverages };

const findSector = (keyword) =>
  sectorAverages.find((s) => s.sector.toLowerCase().includes(keyword)) || { avg_1w: 0, avg_1m: 0 };

const builders = findSector("home");
const materials = findSector("material");
const distributors = findSector("distributor");
const engcon = findSector("engineering"); // institutional proxy

const avgBuilders1W = builders.avg_1w;
const avgBuilders1M = builders.avg_1m;

const bmi = clamp(Math.round(50 + (avgBuilders1W * 2.0) + (avgBuilders1M * 1.0)), 0, 100);
raw.builder_momentum = {
  value: bmi
};

// -----------------------------------------------------
// FRED CPI ingestion + Residential/Institutional subindices
// -----------------------------------------------------

const fredCfg = safeReadJSON(fredCfgAbs);
if (fredCfg === null) throw new Error("config/fred_signals.json missing or invalid JSON");

const apiKey = process.env.FRED_API_KEY || "";
const obsStart = process.env.FRED_OBSERVATION_START || fredCfg?.observation_start_default || "2020-01-01";

raw.capital ??= {};
raw.capital.subindices ??= {};
raw.capital.history ??= Array.isArray(raw.capital.history) ? raw.capital.history : [];

let fredStatus = { ok: false, reason: null };

let compositeCPI = Number(raw.capital.pressure_index ?? 0) || 0;
let resCPI = Number(raw.capital.subindices.residential ?? 0) || 0;
let instCPI = Number(raw.capital.subindices.institutional ?? 0) || 0;

let cpiDelta = 0;

if (!apiKey) {
  fredStatus = { ok: false, reason: "FRED_API_KEY missing (secrets not configured)" };
} else {
  try {
    // Pull only what we need (by key) from config
    const keyToSeries = {};
    for (const s of fredCfg?.signals || []) keyToSeries[s.key] = s.series_id;

    const needed = [
      ["mortgage30", keyToSeries.mortgage30],
      ["unrate", keyToSeries.unrate],
      ["houst", keyToSeries.houst],
      ["permit", keyToSeries.permit],
      ["tlrescons", keyToSeries.tlrescons],
      ["tlnrescons", keyToSeries.tlnrescons]
    ].filter(([, id]) => !!id);

    const seriesData = {};
    for (const [k, id] of needed) {
      seriesData[k] = await fetchFredSeriesObservations({
        seriesId: id,
        apiKey,
        observationStart: obsStart
      });
    }

    // Residential pressures
    // mortgage30: higher rate = higher pressure (invert=false)
    // permit/houst: falling activity = higher pressure (invert=true because higher YoY = easing)
    const mortgageLevel = latestLevel(seriesData.mortgage30);
    const permitYoY = yoyPct(seriesData.permit);
    const houstYoY = yoyPct(seriesData.houst);
    const resSpendYoY = yoyPct(seriesData.tlrescons);

    const mortgageScore =
      mortgageLevel == null ? 50 : scoreFromYoY(mortgageLevel, { midpoint: 6.0, scale: 1.0, invert: false });
    const permitScore =
      permitYoY == null ? 50 : scoreFromYoY(permitYoY, { midpoint: 0, scale: 5.0, invert: true });
    const houstScore =
      houstYoY == null ? 50 : scoreFromYoY(houstYoY, { midpoint: 0, scale: 5.0, invert: true });
    const resSpendScore =
      resSpendYoY == null ? 50 : scoreFromYoY(resSpendYoY, { midpoint: 0, scale: 5.0, invert: true });

    resCPI = clamp(Math.round(
      (mortgageScore * 0.40) +
      (permitScore * 0.25) +
      (houstScore * 0.20) +
      (resSpendScore * 0.15)
    ), 0, 100);

    // Institutional pressures
    // unrate: higher unemployment = higher pressure (invert=false)
    // nonres spend: falling = higher pressure (invert=true)
    const unrateLevel = latestLevel(seriesData.unrate);
    const instSpendYoY = yoyPct(seriesData.tlnrescons);

    const unrateScore =
      unrateLevel == null ? 50 : scoreFromYoY(unrateLevel, { midpoint: 4.0, scale: 1.0, invert: false });
    const instSpendScore =
      instSpendYoY == null ? 50 : scoreFromYoY(instSpendYoY, { midpoint: 0, scale: 5.0, invert: true });

    instCPI = clamp(Math.round((unrateScore * 0.45) + (instSpendScore * 0.55)), 0, 100);

    // Composite CPI (Construction Pressure Index) = blend
    compositeCPI = clamp(Math.round((resCPI * 0.60) + (instCPI * 0.40)), 0, 100);

    // History delta (for CEPS momentum)
    const hist = raw.capital.history.map((h) => Number(h.value ?? 0) || 0);
    cpiDelta = hist.length >= 2 ? (hist.at(-1) - hist.at(-2)) : 0;

    fredStatus = { ok: true, reason: null };
  } catch (e) {
    fredStatus = { ok: false, reason: String(e?.message || e) };
  }
}

raw.capital.subindices.residential = resCPI;
raw.capital.subindices.institutional = instCPI;
raw.capital.pressure_index = compositeCPI;
raw.capital.source_status = fredStatus;

// Append CPI history once/day (no duplicates)
{
  const today = todayISO();
  const last = raw.capital.history.at(-1);
  if (!last || last.date !== today) {
    raw.capital.history.push({ date: today, value: compositeCPI });
  }
}

// -----------------------------------------------------
// CEPS v2 — Nonlinear Institutional Model (Shock-Aware)
// now uses cpiDelta (from capital.history) + 10Y move
// -----------------------------------------------------

const shockMultiplier = (vix >= 25 ? 1.25 : 1.0);
const momentumPersistence = cpiDelta >= 0 ? 1.1 : 0.9;

let baseCeps =
  (avgBuilders1W * 0.30) +
  (distributors.avg_1w * 0.20) +
  (materials.avg_1w * 0.20) +
  (cpiDelta * 0.15) +
  (tenYearMove * 0.15);

let nonlinearAdjustment =
  (Math.abs(avgBuilders1W) > 7 ? avgBuilders1W * 0.10 : 0) +
  (Math.abs(tenYearMove) > 20 ? tenYearMove * 0.05 : 0);

let ceps = (50 + baseCeps + nonlinearAdjustment);
ceps = ceps * shockMultiplier * momentumPersistence;
ceps = clamp(Math.round(ceps), 0, 100);
raw.ceps_score = ceps;

// Residential vs Institutional CEPS splits (equity proxies + CPI subs)
const resCeps = clamp(Math.round(
  50 +
  (avgBuilders1W * 0.45) +
  ((resCPI - 50) * 0.35) +
  (tenYearMove * 0.20)
), 0, 100);

const instCeps = clamp(Math.round(
  50 +
  (engcon.avg_1w * 0.35) +
  ((instCPI - 50) * 0.45) +
  (tenYearMove * 0.20)
), 0, 100);

raw.ceps_split = {
  residential: resCeps,
  institutional: instCeps
};

// -----------------------------------------------------
// Correlation Engine
// -----------------------------------------------------

const builderHistory = rows
  .filter((r) => String(r.subsector || "").toLowerCase().includes("home"))
  .map((r) => Number(r.price_change_1m ?? 0) || 0);

const cpiHistory = raw.capital.history.map((h) => Number(h.value ?? 0) || 0);
const corrWindow = Math.min(cpiHistory.length, builderHistory.length);

raw.correlations = {
  cpi_vs_builders: correlation(cpiHistory.slice(-corrWindow), builderHistory.slice(-corrWindow)),
  regime: ceps >= 70 ? "TIGHTENING" : ceps <= 30 ? "EASING" : "NEUTRAL"
};

// -----------------------------------------------------
// Trend Arrows (1w / 1m deltas) for CPI + CEPS + BMI
// -----------------------------------------------------

raw.trends ??= {};

raw.trends.ceps = {
  delta_1w: getDeltaFromHistory(raw.regime_history.map((h) => ({ date: h.date, value: h.ceps })), 7),
  delta_1m: getDeltaFromHistory(raw.regime_history.map((h) => ({ date: h.date, value: h.ceps })), 30)
};

raw.trends.cpi = {
  delta_1w: getDeltaFromHistory(raw.capital.history, 7),
  delta_1m: getDeltaFromHistory(raw.capital.history, 30)
};

// BMI deltas (derived from regime_history snapshots we store below)
raw.trends.bmi = { delta_1w: null, delta_1m: null };

// -----------------------------------------------------
// Risk Mode + Risk Thermometer Mode
// -----------------------------------------------------

raw.risk_mode = (raw.capital.pressure_index >= 70) || (avgBuilders1W <= -5) || (vix >= 25);
raw.risk_thermometer_mode = raw.capital.pressure_index >= 70;

// Volatility regime
raw.volatility_regime =
  vix >= 30 ? "HIGH" :
  vix >= 20 ? "ELEVATED" :
  "NORMAL";

// Shock flags
raw.shock_flags = {
  rate_shock: Math.abs(tenYearMove) > 25,
  equity_drawdown: avgBuilders1W <= -8,
  volatility_spike: vix >= 30
};

// -----------------------------------------------------
// Regime History Tracker (Daily append, no duplicates)
// Also store BMI so we can compute deltas later
// -----------------------------------------------------

{
  const today = todayISO();
  const latestEntry = raw.regime_history.at(-1);

  if (!latestEntry || latestEntry.date !== today) {
    raw.regime_history.push({
      date: today,
      ceps,
      ceps_residential: resCeps,
      ceps_institutional: instCeps,
      bmi,
      cpi: raw.capital.pressure_index,
      cpi_residential: resCPI,
      cpi_institutional: instCPI,
      volatility: raw.volatility_regime,
      regime: raw.correlations.regime
    });
  }

  // Now that we store BMI, compute BMI deltas from history
  const bmiHist = raw.regime_history.map((h) => ({ date: h.date, value: Number(h.bmi ?? 0) || 0 }));
  raw.trends.bmi.delta_1w = getDeltaFromHistory(bmiHist, 7);
  raw.trends.bmi.delta_1m = getDeltaFromHistory(bmiHist, 30);
}

// -----------------------------------------------------
// Write + Assert shape
// -----------------------------------------------------

assertDashboardShape(raw);
safeWriteJSON(dashAbs, raw);

console.log("✅ Institutional build complete (Schema v3.3.0).");
console.log(`• Dashboard: ${dashAbs}`);
console.log(`• Snapshot: ${snapAbs}`);
console.log(`• Rows merged: ${mergedRows.length}`);
console.log(`• CPI: ${raw.capital.pressure_index} (R:${resCPI} / I:${instCPI}) | CEPS: ${ceps} (R:${resCeps} / I:${instCeps}) | BMI: ${bmi}`);
console.log(`• Regime: ${raw.correlations.regime} | Vol: ${raw.volatility_regime} | Risk: ${raw.risk_mode}`);
console.log(`• FRED: ${fredStatus.ok ? "OK ✅" : `NOT OK ⚠️ (${fredStatus.reason})`}`);
