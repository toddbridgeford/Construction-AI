// scripts/build_dashboard_latest.mjs
// Capital OS v5+ — Predictive Forward Engine (FRED)
// - No dependencies
// - Reads: config/fred_signals.json
// - Writes: dashboard_latest.json (repo root)
// - Requires env: FRED_API_KEY

import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const CFG_PATH = path.join(ROOT, "config", "fred_signals.json");
const OUT_PATH = path.join(ROOT, "dashboard_latest.json");

const FRED_API_KEY = process.env.FRED_API_KEY || "";
if (!FRED_API_KEY) {
  console.error("Missing FRED_API_KEY env var. Add GitHub Secret: FRED_API_KEY");
  process.exit(1);
}

// -----------------------------
// Helpers
// -----------------------------
function clamp(x, a, b) {
  if (Number.isNaN(x) || x === null || x === undefined) return a;
  return Math.min(b, Math.max(a, x));
}

function roundInt(x) {
  if (x === null || x === undefined || Number.isNaN(x)) return null;
  return Math.round(x);
}

function safeNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function isoToday() {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function nowISO() {
  return new Date().toISOString();
}

function pctChange(newV, oldV) {
  const a = safeNum(newV);
  const b = safeNum(oldV);
  if (a === null || b === null) return null;
  if (Math.abs(b) < 1e-9) return null;
  return ((a - b) / Math.abs(b)) * 100.0;
}

function logistic(z) {
  // stable-ish logistic
  const t = clamp(z, -12, 12);
  return 1 / (1 + Math.exp(-t));
}

function normalizeTo100(x, min, max) {
  const v = safeNum(x);
  if (v === null) return null;
  const t = (v - min) / (max - min);
  return clamp(t * 100.0, 0, 100);
}

function mean(arr) {
  const xs = arr.filter((v) => Number.isFinite(v));
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function lastN(arr, n) {
  if (!Array.isArray(arr) || arr.length === 0) return [];
  return arr.slice(Math.max(0, arr.length - n));
}

function parseFREDObservations(json) {
  // FRED: { observations: [{date:"YYYY-MM-DD", value:"123.4"|"."}, ...] }
  const obs = (json && json.observations) || [];
  const rows = obs
    .map((o) => ({
      date: o.date,
      value: o.value === "." ? null : safeNum(o.value),
    }))
    .filter((r) => r.date);
  return rows;
}

async function fredFetchSeries(seriesId, observationStart) {
  const url =
    "https://api.stlouisfed.org/fred/series/observations" +
    `?series_id=${encodeURIComponent(seriesId)}` +
    `&api_key=${encodeURIComponent(FRED_API_KEY)}` +
    `&file_type=json` +
    `&observation_start=${encodeURIComponent(observationStart || "2020-01-01")}` +
    `&sort_order=asc`;

  const res = await fetch(url);
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`FRED fetch failed (${seriesId}): ${res.status} ${txt}`);
  }
  return res.json();
}

function computeYoYFromMonthly(rows) {
  // assume rows ascending; YoY = last vs ~12 months back (closest index -12 if monthly)
  // If not enough, return null.
  const values = rows.filter((r) => r.value !== null);
  if (values.length < 13) return null;
  const last = values[values.length - 1].value;
  const prev = values[values.length - 13].value;
  return pctChange(last, prev);
}

function computeRecentTrend(rows) {
  // return simple 30-day-ish trend: last vs 4 points back (works for weekly/monthly-ish)
  const values = rows.filter((r) => r.value !== null);
  if (values.length < 5) return null;
  const last = values[values.length - 1].value;
  const prev = values[values.length - 5].value;
  return last - prev;
}

// -----------------------------
// Load + fetch series
// -----------------------------
function loadConfig() {
  if (!fs.existsSync(CFG_PATH)) {
    console.error(`Missing config: ${CFG_PATH}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(CFG_PATH, "utf-8");
  return JSON.parse(raw);
}

async function loadSignals(cfg) {
  const startDefault = cfg.observation_start_default || "2020-01-01";
  const signals = cfg.signals || [];

  const out = [];
  for (const s of signals) {
    const key = s.key;
    const series_id = s.series_id;
    const name = s.name || key;
    const region = s.region || "US";
    const units = s.units || "";
    const obsStart = s.observation_start || startDefault;

    try {
      const json = await fredFetchSeries(series_id, obsStart);
      const rows = parseFREDObservations(json);
      const values = rows.filter((r) => r.value !== null).map((r) => r.value);

      const yoy = computeYoYFromMonthly(rows);
      const historyPoints = rows
        .filter((r) => r.value !== null)
        .slice(-24) // keep last 24 points
        .map((r) => ({ date: r.date, value: r.value }));

      out.push({
        key,
        series_id,
        name,
        region,
        units,
        latest: values.length ? values[values.length - 1] : null,
        yoy,
        history: historyPoints,
      });
    } catch (e) {
      // Never hard-fail a whole run for one missing series
      out.push({
        key,
        series_id,
        name,
        region,
        units,
        latest: null,
        yoy: null,
        history: [],
        error: String(e?.message || e),
      });
    }
  }

  return out;
}

function indexByKey(signals) {
  const m = new Map();
  for (const s of signals) m.set(s.key, s);
  return m;
}

// -----------------------------
// Capital OS scoring (stable, deterministic)
// -----------------------------
function computeCapitalAndCEPS(signalsByKey) {
  // Pull the main drivers (safe if missing)
  const mort30 = signalsByKey.get("mortgage30")?.latest ?? null; // %
  const unrate = signalsByKey.get("unrate")?.latest ?? null;     // %
  const houst = signalsByKey.get("houst")?.yoy ?? null;          // % yoy (proxy activity)
  const permit = signalsByKey.get("permit")?.yoy ?? null;        // % yoy
  const cpiYoy = signalsByKey.get("cpi")?.yoy ?? null;           // % yoy (computed from CPI index)
  const tlres = signalsByKey.get("tlrescons")?.yoy ?? null;      // % yoy
  const tlnres = signalsByKey.get("tlnrescons")?.yoy ?? null;    // % yoy

  // Normalize key pressures (higher = tighter)
  const mortPressure = normalizeTo100(mort30, 2.0, 10.0);     // 2%..10%
  const inflPressure = normalizeTo100(cpiYoy, 0.0, 8.0);      // 0..8% yoy
  const unPressure   = normalizeTo100(unrate, 3.0, 10.0);     // 3..10%

  // Activity: declining activity increases pressure => invert YoY
  const permitPressure = permit === null ? null : clamp(normalizeTo100(-permit, -20, 20), 0, 100);
  const houstPressure  = houst === null ? null : clamp(normalizeTo100(-houst, -20, 20), 0, 100);

  // Spending: falling spending increases pressure => invert
  const resSpendPressure  = tlres === null ? null : clamp(normalizeTo100(-tlres, -15, 15), 0, 100);
  const nresSpendPressure = tlnres === null ? null : clamp(normalizeTo100(-tlnres, -15, 15), 0, 100);

  // Weighted composite CPI (Capital Pressure Index): 0..100
  const components = [
    { v: mortPressure, w: 0.28 },
    { v: inflPressure, w: 0.18 },
    { v: unPressure,   w: 0.14 },
    { v: permitPressure, w: 0.16 },
    { v: houstPressure,  w: 0.10 },
    { v: resSpendPressure, w: 0.07 },
    { v: nresSpendPressure, w: 0.07 },
  ].filter((c) => c.v !== null);

  const cpi =
    components.length
      ? clamp(
          components.reduce((a, c) => a + c.v * c.w, 0) /
            components.reduce((a, c) => a + c.w, 0),
          0,
          100
        )
      : 0;

  const cpiInt = roundInt(cpi) ?? 0;

  // CEPS: map tighter capital to pressure score around mid-band
  // Tuned so CPI~53 => CEPS ~55-ish
  const ceps = clamp(40 + (100 - cpi) * 0.30, 0, 100);
  const cepsInt = roundInt(ceps) ?? 0;

  // Residential/Institutional splits:
  // - residential reacts more to permits/housing starts + mortgage
  // - institutional reacts more to nonres spending + unemployment + inflation
  const resMix = mean([
    mortPressure,
    permitPressure,
    houstPressure,
    resSpendPressure,
  ]);
  const instMix = mean([
    inflPressure,
    unPressure,
    nresSpendPressure,
  ]);

  const resCpi = resMix === null ? null : roundInt(clamp(resMix, 0, 100));
  const instCpi = instMix === null ? null : roundInt(clamp(instMix, 0, 100));

  // Translate sub-index pressure into CEPS-ish split
  const resCeps = resCpi === null ? null : roundInt(clamp(40 + (100 - resCpi) * 0.30, 0, 100));
  const instCeps = instCpi === null ? null : roundInt(clamp(40 + (100 - instCpi) * 0.30, 0, 100));

  // Builder momentum (0..100): activity + spend growth (positive = higher momentum)
  const builderMomentumRaw = mean([
    permit === null ? null : clamp(normalizeTo100(permit, -20, 20), 0, 100),
    houst === null ? null : clamp(normalizeTo100(houst, -20, 20), 0, 100),
    tlres === null ? null : clamp(normalizeTo100(tlres, -15, 15), 0, 100),
    tlnres === null ? null : clamp(normalizeTo100(tlnres, -15, 15), 0, 100),
  ]);
  const builderMomentum = builderMomentumRaw === null ? 50 : roundInt(builderMomentumRaw);

  // CPI band text
  const band =
    cpiInt >= 80 ? "RESTRICTIVE" :
    cpiInt >= 65 ? "TIGHTENING" :
    cpiInt >= 45 ? "NEUTRAL" :
    cpiInt >= 25 ? "EASING" :
                   "EASY";

  const riskMode = cpiInt >= 70 || band === "RESTRICTIVE";
  const riskThermometerMode = cpiInt >= 70;

  // Volatility regime (simple): higher mortgage + higher inflation => elevated vol
  const volScore = mean([mortPressure, inflPressure]);
  const volatilityRegime =
    volScore === null ? "NORMAL" :
    volScore >= 70 ? "ELEVATED" :
    volScore >= 55 ? "NORMAL" :
                     "LOW";

  // Macro regime label (simple desk-style)
  const regime =
    riskMode ? "RISK-OFF" :
    cpiInt <= 35 ? "RISK-ON" :
    "NEUTRAL";

  return {
    cpi: cpiInt,
    cpiBand: band,
    ceps: cepsInt,
    cepsSplit: {
      residential: resCeps ?? null,
      institutional: instCeps ?? null,
    },
    capitalSubindices: {
      residential: resCpi ?? null,
      institutional: instCpi ?? null,
    },
    builderMomentum,
    riskMode,
    riskThermometerMode,
    volatilityRegime,
    regime,
  };
}

function computePredictiveEngine(signalsByKey, currentCpi) {
  // Minimal, stable forward projection (30D) + probability CPI>=70
  // Uses:
  // - mortgage rate short trend
  // - permits/housing starts YoY
  // - unemployment + inflation levels
  const mortRows = signalsByKey.get("mortgage30")?.history || [];
  const unRows = signalsByKey.get("unrate")?.history || [];
  const cpiRows = signalsByKey.get("cpi")?.history || [];

  // trend proxies
  const mortTrend = computeRecentTrend(mortRows); // points-based
  const unTrend = computeRecentTrend(unRows);
  const inflTrend = computeRecentTrend(cpiRows);  // CPI index trend, not yoy

  const permitYoy = signalsByKey.get("permit")?.yoy ?? null;
  const houstYoy  = signalsByKey.get("houst")?.yoy ?? null;
  const unrate    = signalsByKey.get("unrate")?.latest ?? null;
  const mort30    = signalsByKey.get("mortgage30")?.latest ?? null;
  const cpiYoy    = signalsByKey.get("cpi")?.yoy ?? null;

  // Convert trends into "pressure delta"
  const mortDeltaPressure = mortTrend === null ? 0 : clamp(mortTrend * 6.0, -8, 8);  // small moves matter
  const unDeltaPressure   = unTrend === null ? 0 : clamp(unTrend * 8.0, -8, 8);
  const inflDeltaPressure = inflTrend === null ? 0 : clamp(inflTrend * 0.15, -6, 6);

  const activityPressure =
    mean([
      permitYoy === null ? null : clamp(-permitYoy / 5.0, -8, 8), // falling permits adds pressure
      houstYoy  === null ? null : clamp(-houstYoy  / 5.0, -8, 8),
    ]) ?? 0;

  const levelPressure =
    mean([
      mort30 === null ? null : clamp((mort30 - 5.0) * 2.0, -10, 10),
      unrate === null ? null : clamp((unrate - 4.5) * 2.0, -10, 10),
      cpiYoy  === null ? null : clamp((cpiYoy - 3.0) * 2.0, -10, 10),
    ]) ?? 0;

  // Projection model
  const projected =
    clamp(
      currentCpi +
        0.45 * mortDeltaPressure +
        0.25 * unDeltaPressure +
        0.25 * inflDeltaPressure +
        0.55 * activityPressure +
        0.15 * levelPressure,
      0,
      100
    );

  const projectedInt = roundInt(projected) ?? currentCpi;

  // Probability CPI >= 70 (logistic around threshold)
  const prob = logistic((projected - 70) / 6.0); // steeper around 70
  const probPct = Math.round(prob * 100);

  // Drivers (explainable)
  const drivers = [
    { key: "mortgage30_trend", value: mortTrend ?? null },
    { key: "permits_yoy", value: permitYoy ?? null },
    { key: "housing_starts_yoy", value: houstYoy ?? null },
    { key: "unrate_trend", value: unTrend ?? null },
    { key: "cpi_yoy", value: cpiYoy ?? null },
  ];

  return {
    horizon_days: 30,
    projected_cpi_30d: projectedInt,
    prob_cpi_ge_70: probPct, // integer percent (0..100)
    drivers,
  };
}

// -----------------------------
// Main build
// -----------------------------
async function main() {
  const cfg = loadConfig();
  const signals = await loadSignals(cfg);
  const byKey = indexByKey(signals);

  const today = isoToday();

  const capital = computeCapitalAndCEPS(byKey);
  const predictive = computePredictiveEngine(byKey, capital.cpi);

  // Status + alerts (Phase A/B safe defaults)
  const alertLevel = capital.riskMode ? "WATCH" : "MONITOR";
  const alertBanner = `${alertLevel} — ${capital.regime === "RISK-OFF" ? "DEFENSIVE" : "STABLE"}`;

  // Build a minimal-but-rich dashboard object (schema stable for your UI)
  // NOTE: Keep keys consistent with your Swift decode surfaces.
  const out = {
    schema_version: "3.2.0",
    generated_at: nowISO(),

    executive: {
      headline: "Construction Intelligence",
      confidence: "medium",
      summary:
        capital.riskMode
          ? "Capital conditions are tightening. Maintain a defensive posture, monitor housing and permits for confirmation."
          : "Capital conditions are stable. Monitor mortgage trend and permits for inflection signals."
    },

    // Core metrics
    ceps_score: capital.ceps,
    ceps_split: {
      residential: capital.cepsSplit.residential,
      institutional: capital.cepsSplit.institutional
    },

    builder_momentum: {
      value: capital.builderMomentum
    },

    capital: {
      pressure_index: capital.cpi,
      band: capital.cpiBand,
      subindices: {
        residential: capital.capitalSubindices.residential,
        institutional: capital.capitalSubindices.institutional
      },
      history: [
        { date: today, value: capital.cpi }
      ]
    },

    correlations: {
      cpi_vs_builders: 0,
      regime: capital.regime
    },

    risk_mode: capital.riskMode,
    risk_thermometer_mode: capital.riskThermometerMode,
    volatility_regime: capital.volatilityRegime,

    shock_flags: {
      rate_shock: false,
      equity_drawdown: false,
      volatility_spike: false
    },

    // Predictive Forward Engine (Phase B)
    predictive_engine: predictive,

    // Acceleration Engine (kept for UI; stable defaults)
    acceleration_engine: {
      divergence: 2,
      deltas: {
        cpi_7d: null,
        cpi_30d: null,
        ceps_7d: null,
        ceps_30d: null,
        bmi_7d: null,
        bmi_30d: null
      },
      flags: {
        cpi_accelerating_7d: false,
        cpi_accelerating_30d: false,
        ceps_accelerating_7d: false,
        ceps_accelerating_30d: false,
        equity_tightening_divergence: false,
        equity_easing_divergence: false,
        builder_early_warning: false
      },
      alert_level: alertLevel
    },

    // Signals array for UI “Top 5 Signals”
    // Keep fields: name, region, units, yoy, history[]
    signals: signals.map((s) => ({
      name: s.name,
      region: s.region,
      units: s.units,
      yoy: s.yoy,
      history: s.history
    })),

    // Alerts array (optional; your UI can show banners)
    alerts: [
      {
        id: "banner",
        title: alertBanner,
        severity: alertLevel,
        why_it_matters:
          alertLevel === "WATCH"
            ? "Composite conditions suggest tightening capital with elevated forward risk."
            : "Composite conditions remain stable; continue monitoring leading indicators."
      }
    ],

    // Regime history (Structural memory hook)
    regime_history: [
      {
        date: today,
        ceps: capital.ceps,
        cpi: capital.cpi,
        volatility: capital.volatilityRegime,
        regime: capital.regime,
        projected_cpi_30d: predictive.projected_cpi_30d,
        prob_cpi_ge_70: predictive.prob_cpi_ge_70
      }
    ]
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2), "utf-8");
  console.log(`Wrote ${path.relative(ROOT, OUT_PATH)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
