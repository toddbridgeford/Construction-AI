// scripts/build_dashboard_latest.mjs
// Capital OS — Construction Intelligence Edition
// Node 20+ (ESM). Uses FRED_API_KEY from env.
// Input:  config/fred_signals.json
// Output: dashboard_latest.json (repo root)

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -------------------------
// Config
// -------------------------

const FRED_API_KEY = process.env.FRED_API_KEY || "";
const CONFIG_PATH = path.resolve(__dirname, "../config/fred_signals.json");
const OUTPUT_PATH = path.resolve(__dirname, "../dashboard_latest.json");

// FRED base
const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";

// -------------------------
// Utils
// -------------------------

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const round = (x, n = 2) => {
  if (x === null || x === undefined || Number.isNaN(x)) return null;
  const p = 10 ** n;
  return Math.round(x * p) / p;
};

function toNumberMaybe(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (s === "." || s === "" || s.toLowerCase() === "nan") return null;
  const d = Number(s);
  return Number.isFinite(d) ? d : null;
}

function isoNow() {
  return new Date().toISOString();
}

function todayYYYYMMDD() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function safeUpper(s) {
  return (s ?? "").toString().trim().toUpperCase();
}

function bandFromCPI(cpi) {
  if (cpi >= 70) return "RESTRICTIVE";
  if (cpi >= 60) return "TIGHTENING";
  if (cpi >= 45) return "NEUTRAL";
  return "EASING";
}

function severityFromCPI(cpi) {
  if (cpi >= 70) return "WATCH";
  if (cpi >= 60) return "MONITOR";
  return "MONITOR";
}

function volatilityFromShock(probGe70, mortgageTrend, permitsYoy) {
  // simple qualitative proxy
  const s =
    (probGe70 ?? 0) +
    Math.abs(mortgageTrend ?? 0) * 15 +
    Math.abs(permitsYoy ?? 0) * 0.3;
  if (s >= 12) return "HIGH";
  if (s >= 6) return "NORMAL";
  return "LOW";
}

function pickWindowByFrequency(seriesId) {
  // FRED series differ in frequency; we just default to “enough”
  // - Mortgage weekly -> ~260 points for 5 years
  // - Monthly -> ~72 points for 6 years
  // Safe universal:
  return { limit: 3000 };
}

function getClosestToDate(history, targetYYYYMMDD) {
  // history: [{date, value}] sorted asc
  if (!history?.length) return null;
  const target = new Date(`${targetYYYYMMDD}T00:00:00Z`).getTime();
  let best = null;
  let bestDist = Infinity;
  for (const p of history) {
    const t = new Date(`${p.date}T00:00:00Z`).getTime();
    const dist = Math.abs(t - target);
    if (dist < bestDist) {
      bestDist = dist;
      best = p;
    }
  }
  return best;
}

function computeYoY(history) {
  // returns yoy % change using nearest point ~1y ago
  if (!history || history.length < 2) return null;
  const last = history[history.length - 1];
  if (last.value == null) return null;

  const lastDate = new Date(`${last.date}T00:00:00Z`);
  const yearAgo = new Date(Date.UTC(lastDate.getUTCFullYear() - 1, lastDate.getUTCMonth(), lastDate.getUTCDate()));
  const yearAgoStr = `${yearAgo.getUTCFullYear()}-${String(yearAgo.getUTCMonth() + 1).padStart(2, "0")}-${String(
    yearAgo.getUTCDate()
  ).padStart(2, "0")}`;

  const prev = getClosestToDate(history, yearAgoStr);
  if (!prev || prev.value == null) return null;

  // percent change
  if (prev.value === 0) return null;
  return ((last.value / prev.value) - 1) * 100;
}

function computeTrend(history, pointsBack = 4) {
  // last - value N points back (weekly/multi points)
  if (!history || history.length < pointsBack + 1) return null;
  const last = history[history.length - 1]?.value;
  const prev = history[history.length - 1 - pointsBack]?.value;
  if (last == null || prev == null) return null;
  return last - prev;
}

function computeMoMTrend(history) {
  // monthly series: last - prev
  return computeTrend(history, 1);
}

function normalizePct(x, cap = 10) {
  if (x == null) return 0;
  return clamp(x / cap, -1, 1);
}

function normalizeAbs(x, cap = 1) {
  if (x == null) return 0;
  return clamp(x / cap, -1, 1);
}

// -------------------------
// FRED fetch
// -------------------------

async function fetchFREDSeries(seriesId, observationStartDefault) {
  if (!FRED_API_KEY) {
    throw new Error("Missing FRED_API_KEY env var. Add GitHub Secret FRED_API_KEY.");
  }

  const { limit } = pickWindowByFrequency(seriesId);

  const url = new URL(FRED_BASE);
  url.searchParams.set("series_id", seriesId);
  url.searchParams.set("api_key", FRED_API_KEY);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("sort_order", "asc");
  url.searchParams.set("observation_start", observationStartDefault || "2020-01-01");
  url.searchParams.set("limit", String(limit));

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`FRED fetch failed (${seriesId}) HTTP ${res.status}: ${body.slice(0, 180)}`);
  }
  const json = await res.json();

  const obs = Array.isArray(json?.observations) ? json.observations : [];
  const out = obs
    .map((o) => ({
      date: o.date,
      value: toNumberMaybe(o.value),
    }))
    .filter((p) => p.date && p.value != null);

  return out;
}

// -------------------------
// Core Scoring (simple + stable)
// -------------------------

function computeCoreEngines(seriesMap) {
  // seriesMap keys based on your config keys:
  // mortgage30, permit, houst, unrate, cpi
  const mortgageHist = seriesMap.mortgage30?.history ?? [];
  const permitsHist = seriesMap.permit?.history ?? [];
  const startsHist = seriesMap.houst?.history ?? [];
  const unrateHist = seriesMap.unrate?.history ?? [];
  const cpiHist = seriesMap.cpi?.history ?? [];

  const mortgageTrend = computeTrend(mortgageHist, 4); // ~1 month for weekly
  const permitsYoy = computeYoY(permitsHist);
  const startsYoy = computeYoY(startsHist);
  const unrateTrend = computeMoMTrend(unrateHist);
  const cpiYoy = computeYoY(cpiHist);

  // CPI score (0-100): higher = tighter/restrictive
  // Interpretations:
  // - Mortgage rising -> tighter
  // - CPI YoY rising -> tighter
  // - Unemployment rising -> easing (offset)
  // - Permits falling -> easing/slowdown (offset)
  // - Starts falling -> easing/slowdown (offset)
  const tight =
    50 +
    22 * normalizeAbs(mortgageTrend, 0.25) +
    18 * normalizePct(cpiYoy, 6) -
    10 * normalizeAbs(unrateTrend, 0.25) -
    10 * normalizePct(permitsYoy, 10) -
    8 * normalizePct(startsYoy, 12);

  const cpiScore = clamp(Math.round(tight), 0, 100);

  // CEPS score: “construction environment pressure score” (0-100)
  // Slightly more influenced by construction activity (permits/starts) than inflation.
  const ceps =
    50 +
    14 * normalizeAbs(mortgageTrend, 0.25) +
    10 * normalizePct(cpiYoy, 6) -
    16 * normalizePct(permitsYoy, 10) -
    14 * normalizePct(startsYoy, 12) -
    6 * normalizeAbs(unrateTrend, 0.25);

  const cepsScore = clamp(Math.round(ceps), 0, 100);

  // Split (rough, stable)
  const cepsResidential = clamp(Math.round(cepsScore - 3), 0, 100);
  const cepsInstitutional = clamp(Math.round(cepsScore + 4), 0, 100);

  // Subindices for capital (rough)
  const capRes = clamp(Math.round(cpiScore + 6), 0, 100);
  const capInst = clamp(Math.round(cpiScore - 12), 0, 100);

  // Builder momentum (0-100): more sensitive to permits/starts
  const bMom =
    50 -
    20 * normalizePct(permitsYoy, 10) -
    18 * normalizePct(startsYoy, 12) +
    6 * normalizeAbs(mortgageTrend, 0.25);
  const builderMomentum = clamp(Math.round(bMom), 0, 100);

  // Predictive forward (30d): very simple projection based on drivers
  const projectedCpi30d = clamp(Math.round(cpiScore + 0.4 * (normalizeAbs(mortgageTrend, 0.25) * 10)), 0, 100);

  // Probability CPI >= 70
  const probGe70 =
    clamp(
      Math.round(
        2 +
          18 * Math.max(0, normalizeAbs(mortgageTrend, 0.25)) +
          10 * Math.max(0, normalizePct(cpiYoy, 6))
      ),
      0,
      95
    );

  const drivers = [
    { key: "mortgage30_trend", value: mortgageTrend },
    { key: "permits_yoy", value: permitsYoy },
    { key: "housing_starts_yoy", value: startsYoy },
    { key: "unrate_trend", value: unrateTrend },
    { key: "cpi_yoy", value: cpiYoy },
  ];

  const volRegime = volatilityFromShock(probGe70, mortgageTrend, permitsYoy);

  return {
    mortgageTrend,
    permitsYoy,
    startsYoy,
    unrateTrend,
    cpiYoy,
    cpiScore,
    cepsScore,
    cepsResidential,
    cepsInstitutional,
    capRes,
    capInst,
    builderMomentum,
    projectedCpi30d,
    probGe70,
    drivers,
    volRegime,
  };
}

// -------------------------
// Load config + build
// -------------------------

async function readJSON(p) {
  const raw = await fs.readFile(p, "utf8");
  return JSON.parse(raw);
}

async function writeJSON(p, obj) {
  const txt = JSON.stringify(obj, null, 2) + "\n";
  await fs.writeFile(p, txt, "utf8");
}

async function loadExistingDashboardIfAny() {
  try {
    const raw = await fs.readFile(OUTPUT_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed;
    return null;
  } catch {
    return null;
  }
}

function buildRegimeHistory(existing, entry) {
  const prev = Array.isArray(existing?.regime_history) ? existing.regime_history : [];
  // keep last 180 entries
  const merged = [...prev, entry];

  // de-dupe by date
  const seen = new Set();
  const out = [];
  for (let i = merged.length - 1; i >= 0; i--) {
    const d = merged[i]?.date;
    if (!d) continue;
    if (seen.has(d)) continue;
    seen.add(d);
    out.push(merged[i]);
  }
  out.reverse();
  return out.slice(-180);
}

function buildSignalsPayload(configSignals, seriesMap) {
  // Keep each signal’s history as provided
  return configSignals.map((s) => {
    const key = s.key;
    const hist = seriesMap[key]?.history ?? [];
    const yoy = computeYoY(hist);
    return {
      name: s.name,
      region: s.region ?? "US",
      units: s.units ?? "",
      yoy: yoy == null ? null : yoy,
      history: hist.map((p) => ({ date: p.date, value: p.value })),
    };
  });
}

function executiveSummary(cpiScore, band) {
  if (cpiScore >= 70) {
    return "Capital conditions are restrictive. Prioritize risk controls and monitor permits and labor for demand compression.";
  }
  if (cpiScore >= 60) {
    return "Capital conditions are tightening. Watch mortgage direction and permits closely for forward inflection.";
  }
  if (band === "EASING") {
    return "Capital conditions are easing. Monitor demand stabilization signals and any re-acceleration in inflation.";
  }
  return "Capital conditions are stable. Monitor mortgage trend and permits for inflection signals.";
}

// -------------------------
// Main
// -------------------------

async function main() {
  const cfg = await readJSON(CONFIG_PATH);

  const observationStartDefault = cfg.observation_start_default || "2020-01-01";
  const configSignals = Array.isArray(cfg.signals) ? cfg.signals : [];
  if (configSignals.length === 0) {
    throw new Error("config/fred_signals.json has no signals[]");
  }

  // Fetch all series
  const seriesMap = {};
  for (const s of configSignals) {
    const key = s.key;
    const seriesId = s.series_id;
    if (!key || !seriesId) continue;
    const history = await fetchFREDSeries(seriesId, observationStartDefault);
    seriesMap[key] = { ...s, history };
  }

  // Engines
  const eng = computeCoreEngines(seriesMap);

  // Core top-line
  const schemaVersion = "3.2.0";
  const generatedAt = isoNow();

  const cpiScore = eng.cpiScore;
  const band = bandFromCPI(cpiScore);

  const riskMode = cpiScore >= 70 || band === "RESTRICTIVE";
  const riskThermometerMode = riskMode; // you can decouple later

  const severity = severityFromCPI(cpiScore);

  const executive = {
    headline: "Construction Intelligence",
    confidence: "medium",
    summary: executiveSummary(cpiScore, band),
  };

  const existing = await loadExistingDashboardIfAny();

  // Build output JSON
  const out = {
    schema_version: schemaVersion,
    generated_at: generatedAt,

    executive,

    ceps_score: eng.cepsScore,
    ceps_split: {
      residential: eng.cepsResidential,
      institutional: eng.cepsInstitutional,
    },

    // FIX: Always define builder_momentum
    builder_momentum: { value: eng.builderMomentum },

    capital: {
      pressure_index: cpiScore,
      band: safeUpper(band),
      subindices: {
        residential: eng.capRes,
        institutional: eng.capInst,
      },
      history: [
        {
          date: todayYYYYMMDD(),
          value: cpiScore,
        },
      ],
    },

    correlations: {
      cpi_vs_builders: 0,
      regime: safeUpper(bandFromCPI(cpiScore)),
    },

    risk_mode: Boolean(riskMode),
    risk_thermometer_mode: Boolean(riskThermometerMode),
    volatility_regime: safeUpper(eng.volRegime),

    shock_flags: {
      rate_shock: false,
      equity_drawdown: false,
      volatility_spike: eng.volRegime === "HIGH",
    },

    predictive_engine: {
      horizon_days: 30,
      projected_cpi_30d: eng.projectedCpi30d,
      prob_cpi_ge_70: eng.probGe70,
      drivers: eng.drivers.map((d) => ({ key: d.key, value: d.value })),
    },

    acceleration_engine: {
      divergence: 2,
      deltas: {
        cpi_7d: null,
        cpi_30d: null,
        ceps_7d: null,
        ceps_30d: null,
        bmi_7d: null,
        bmi_30d: null,
      },
      flags: {
        cpi_accelerating_7d: false,
        cpi_accelerating_30d: false,
        ceps_accelerating_7d: false,
        ceps_accelerating_30d: false,
        equity_tightening_divergence: false,
        equity_easing_divergence: false,
        builder_early_warning: false,
      },
      alert_level: safeUpper(severity),
    },

    signals: buildSignalsPayload(configSignals, seriesMap),

    alerts: [
      {
        id: "banner",
        title: `${safeUpper(severity)} — ${band === "NEUTRAL" ? "STABLE" : safeUpper(band)}`,
        severity: safeUpper(severity),
        why_it_matters: "Composite conditions remain stable; continue monitoring leading indicators.",
      },
    ],
  };

  // Regime history append (Structural Cycle Memory)
  const histEntry = {
    date: todayYYYYMMDD(),
    ceps: eng.cepsScore,
    cpi: cpiScore,
    volatility: safeUpper(eng.volRegime),
    regime: safeUpper(bandFromCPI(cpiScore)),
    projected_cpi_30d: eng.projectedCpi30d,
    prob_cpi_ge_70: eng.probGe70,
  };
  out.regime_history = buildRegimeHistory(existing, histEntry);

  // Basic rounding pass for nicer JSON
  // (keep integers where meaningful, but normalize floats)
  out.predictive_engine.prob_cpi_ge_70 = Math.round(out.predictive_engine.prob_cpi_ge_70);
  out.predictive_engine.projected_cpi_30d = Math.round(out.predictive_engine.projected_cpi_30d);

  out.predictive_engine.drivers = out.predictive_engine.drivers.map((d) => ({
    key: d.key,
    value: d.value == null ? null : round(d.value, 6),
  }));

  // Write
  await writeJSON(OUTPUT_PATH, out);

  // Console summary (Actions logs)
  console.log("Wrote dashboard_latest.json");
  console.log(`CPI=${cpiScore} (${band})  CEPS=${eng.cepsScore}  BMI=${eng.builderMomentum}`);
  console.log(`Projected CPI (30d)=${eng.projectedCpi30d}  Prob CPI>=70=${eng.probGe70}%`);
}

main().catch((err) => {
  console.error("Build failed:", err?.message || err);
  process.exit(1);
});
