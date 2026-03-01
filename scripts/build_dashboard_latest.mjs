// scripts/build_dashboard_latest.mjs
// Capital OS — Construction Intelligence Edition (Clean, Stable)
// Node 20+ (ESM). Uses built-in fetch.
//
// Inputs:
//   - config/fred_signals.json
//   - (optional) existing dashboard_latest.json (to append regime_history)
//
// Env:
//   - FRED_API_KEY (required in GitHub Actions)
//   - FRED_OBSERVATION_START (optional, default from config or 2020-01-01)
//   - OUT_PATH (optional, default dashboard_latest.json at repo root)

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------- Paths ----------
const CONFIG_PATH = path.resolve(__dirname, "../config/fred_signals.json");
const DEFAULT_OUT = path.resolve(__dirname, "../dashboard_latest.json");
const OUT_PATH = process.env.OUT_PATH
  ? path.resolve(process.cwd(), process.env.OUT_PATH)
  : DEFAULT_OUT;

// ---------- Env ----------
const FRED_API_KEY = (process.env.FRED_API_KEY || "").trim();
const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";

// ---------- Helpers ----------
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

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

function toNumberMaybe(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (s === "" || s === "." || s.toLowerCase() === "nan") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

async function readJSON(p) {
  const raw = await fs.readFile(p, "utf8");
  return JSON.parse(raw);
}

async function writeJSON(p, obj) {
  await fs.writeFile(p, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

async function loadExistingDashboard(p) {
  try {
    const raw = await fs.readFile(p, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function bandFromCPI(cpi) {
  if (cpi >= 70) return "RESTRICTIVE";
  if (cpi >= 60) return "TIGHTENING";
  if (cpi >= 45) return "NEUTRAL";
  return "EASING";
}

function severityFromCPI(cpi) {
  // Keep simple & stable (you can widen later)
  if (cpi >= 70) return "WATCH";
  return "MONITOR";
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

function getClosestToDate(history, targetYYYYMMDD) {
  if (!Array.isArray(history) || history.length === 0) return null;
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
  if (!Array.isArray(history) || history.length < 2) return null;
  const last = history[history.length - 1];
  if (!last || last.value == null) return null;

  const lastDate = new Date(`${last.date}T00:00:00Z`);
  const yearAgo = new Date(
    Date.UTC(
      lastDate.getUTCFullYear() - 1,
      lastDate.getUTCMonth(),
      lastDate.getUTCDate()
    )
  );

  const yearAgoStr = `${yearAgo.getUTCFullYear()}-${String(
    yearAgo.getUTCMonth() + 1
  ).padStart(2, "0")}-${String(yearAgo.getUTCDate()).padStart(2, "0")}`;

  const prev = getClosestToDate(history, yearAgoStr);
  if (!prev || prev.value == null || prev.value === 0) return null;

  return (last.value / prev.value - 1) * 100;
}

function computeTrend(history, pointsBack = 1) {
  if (!Array.isArray(history) || history.length < pointsBack + 1) return null;
  const last = history[history.length - 1]?.value;
  const prev = history[history.length - 1 - pointsBack]?.value;
  if (last == null || prev == null) return null;
  return last - prev;
}

// Normalizers (bounded)
function normPct(x, cap = 10) {
  if (x == null) return 0;
  return clamp(x / cap, -1, 1);
}
function normAbs(x, cap = 1) {
  if (x == null) return 0;
  return clamp(x / cap, -1, 1);
}

// ---------- FRED ----------
async function fetchFREDSeries(seriesId, observationStart) {
  if (!FRED_API_KEY) {
    throw new Error(
      "Missing FRED_API_KEY env var. Add GitHub Actions secret: FRED_API_KEY."
    );
  }

  const url = new URL(FRED_BASE);
  url.searchParams.set("series_id", seriesId);
  url.searchParams.set("api_key", FRED_API_KEY);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("sort_order", "asc");
  url.searchParams.set("observation_start", observationStart || "2020-01-01");
  url.searchParams.set("limit", "3000");

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `FRED fetch failed (${seriesId}) HTTP ${res.status}: ${body.slice(0, 220)}`
    );
  }

  const json = await res.json();
  const obs = Array.isArray(json?.observations) ? json.observations : [];

  return obs
    .map((o) => ({ date: o.date, value: toNumberMaybe(o.value) }))
    .filter((p) => p.date && p.value != null);
}

// ---------- Engines ----------
function computeEngines(seriesMap) {
  // Based on config keys: mortgage30, permit, houst, unrate, cpi
  const mortgageHist = seriesMap.mortgage30?.history ?? [];
  const permitsHist = seriesMap.permit?.history ?? [];
  const startsHist = seriesMap.houst?.history ?? [];
  const unrateHist = seriesMap.unrate?.history ?? [];
  const cpiHist = seriesMap.cpi?.history ?? [];

  // Mortgage is weekly → ~4 pts ≈ 1 month
  const mortgageTrend = computeTrend(mortgageHist, 4);
  const permitsYoy = computeYoY(permitsHist);
  const startsYoy = computeYoY(startsHist);
  const unrateTrend = computeTrend(unrateHist, 1); // monthly MoM
  const cpiYoy = computeYoY(cpiHist);

  // CPI score (0–100): higher = tighter/restrictive
  const cpiScore = clamp(
    Math.round(
      50 +
        22 * normAbs(mortgageTrend, 0.25) +
        18 * normPct(cpiYoy, 6) -
        10 * normAbs(unrateTrend, 0.25) -
        10 * normPct(permitsYoy, 10) -
        8 * normPct(startsYoy, 12)
    ),
    0,
    100
  );

  // CEPS score (0–100): more activity-sensitive
  const cepsScore = clamp(
    Math.round(
      50 +
        14 * normAbs(mortgageTrend, 0.25) +
        10 * normPct(cpiYoy, 6) -
        16 * normPct(permitsYoy, 10) -
        14 * normPct(startsYoy, 12) -
        6 * normAbs(unrateTrend, 0.25)
    ),
    0,
    100
  );

  // Builder momentum (0–100): heavily permits/starts
  const builderMomentum = clamp(
    Math.round(
      50 -
        20 * normPct(permitsYoy, 10) -
        18 * normPct(startsYoy, 12) +
        6 * normAbs(mortgageTrend, 0.25)
    ),
    0,
    100
  );

  // Capital subindices (stable offsets)
  const capRes = clamp(Math.round(cpiScore + 6), 0, 100);
  const capInst = clamp(Math.round(cpiScore - 12), 0, 100);

  // Predictive (simple forward projection)
  const projectedCpi30d = clamp(
    Math.round(cpiScore + 4 * Math.max(0, normAbs(mortgageTrend, 0.25))),
    0,
    100
  );

  const probGe70 = clamp(
    Math.round(
      2 +
        18 * Math.max(0, normAbs(mortgageTrend, 0.25)) +
        10 * Math.max(0, normPct(cpiYoy, 6))
    ),
    0,
    95
  );

  const volScore =
    (probGe70 ?? 0) +
    Math.abs(mortgageTrend ?? 0) * 15 +
    Math.abs(permitsYoy ?? 0) * 0.3;

  const volatilityRegime = volScore >= 12 ? "HIGH" : volScore >= 6 ? "NORMAL" : "LOW";

  return {
    mortgageTrend,
    permitsYoy,
    startsYoy,
    unrateTrend,
    cpiYoy,
    cpiScore,
    cepsScore,
    cepsResidential: clamp(Math.round(cepsScore - 3), 0, 100),
    cepsInstitutional: clamp(Math.round(cepsScore + 4), 0, 100),
    builderMomentum,
    capRes,
    capInst,
    projectedCpi30d,
    probGe70,
    volatilityRegime,
    drivers: [
      { key: "mortgage30_trend", value: mortgageTrend },
      { key: "permits_yoy", value: permitsYoy },
      { key: "housing_starts_yoy", value: startsYoy },
      { key: "unrate_trend", value: unrateTrend },
      { key: "cpi_yoy", value: cpiYoy },
    ],
  };
}

function buildSignalsPayload(configSignals, seriesMap) {
  return configSignals.map((s) => {
    const hist = seriesMap[s.key]?.history ?? [];
    return {
      name: s.name,
      region: s.region ?? "US",
      units: s.units ?? "",
      yoy: computeYoY(hist),
      history: hist.map((p) => ({ date: p.date, value: p.value })),
    };
  });
}

function buildRegimeHistory(existing, entry) {
  const prev = Array.isArray(existing?.regime_history) ? existing.regime_history : [];
  const merged = [...prev, entry];

  // De-dupe by date (keep newest)
  const seen = new Set();
  const out = [];
  for (let i = merged.length - 1; i >= 0; i--) {
    const d = merged[i]?.date;
    if (!d || seen.has(d)) continue;
    seen.add(d);
    out.push(merged[i]);
  }
  out.reverse();
  return out.slice(-180);
}

// ---------- Main ----------
async function main() {
  const cfg = await readJSON(CONFIG_PATH);

  const observationStart =
    (process.env.FRED_OBSERVATION_START || "").trim() ||
    (cfg.observation_start_default || "2020-01-01");

  const configSignals = Array.isArray(cfg.signals) ? cfg.signals : [];
  if (configSignals.length === 0) {
    throw new Error("config/fred_signals.json has no signals[]");
  }

  // Fetch all series
  const seriesMap = {};
  for (const s of configSignals) {
    if (!s?.key || !s?.series_id) continue;
    const history = await fetchFREDSeries(s.series_id, observationStart);
    seriesMap[s.key] = { ...s, history };
  }

  const eng = computeEngines(seriesMap);

  const cpiScore = eng.cpiScore;
  const band = bandFromCPI(cpiScore);
  const severity = severityFromCPI(cpiScore);

  const riskMode = cpiScore >= 70;
  const riskThermometerMode = riskMode;

  const executive = {
    headline: "Construction Intelligence",
    confidence: "medium",
    summary: executiveSummary(cpiScore, band),
  };

  const existing = await loadExistingDashboard(OUT_PATH);

  const out = {
    schema_version: "3.2.0",
    generated_at: isoNow(),

    executive,

    ceps_score: eng.cepsScore,
    ceps_split: {
      residential: eng.cepsResidential,
      institutional: eng.cepsInstitutional,
    },

    // IMPORTANT: defined (prevents builder_momentum undefined failures)
    builder_momentum: { value: eng.builderMomentum },

    capital: {
      pressure_index: cpiScore,
      band: safeUpper(band),
      subindices: {
        residential: eng.capRes,
        institutional: eng.capInst,
      },
      history: [{ date: todayYYYYMMDD(), value: cpiScore }],
    },

    correlations: {
      cpi_vs_builders: 0,
      regime: safeUpper(bandFromCPI(cpiScore)),
    },

    risk_mode: Boolean(riskMode),
    risk_thermometer_mode: Boolean(riskThermometerMode),
    volatility_regime: safeUpper(eng.volatilityRegime),

    shock_flags: {
      rate_shock: false,
      equity_drawdown: false,
      volatility_spike: eng.volatilityRegime === "HIGH",
    },

    predictive_engine: {
      horizon_days: 30,
      projected_cpi_30d: eng.projectedCpi30d,
      prob_cpi_ge_70: eng.probGe70,
      drivers: eng.drivers,
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
        why_it_matters:
          "Composite conditions remain stable; continue monitoring leading indicators.",
      },
    ],
  };

  // Structural Cycle Memory (regime_history append)
  const histEntry = {
    date: todayYYYYMMDD(),
    ceps: eng.cepsScore,
    cpi: cpiScore,
    volatility: safeUpper(eng.volatilityRegime),
    regime: safeUpper(bandFromCPI(cpiScore)),
    projected_cpi_30d: eng.projectedCpi30d,
    prob_cpi_ge_70: eng.probGe70,
  };
  out.regime_history = buildRegimeHistory(existing, histEntry);

  await writeJSON(OUT_PATH, out);

  // Logs (GitHub Actions)
  console.log(`Wrote: ${OUT_PATH}`);
  console.log(`CPI=${cpiScore} (${band})  CEPS=${eng.cepsScore}  BMI=${eng.builderMomentum}`);
  console.log(`Projected CPI (30d)=${eng.projectedCpi30d}  Prob CPI>=70=${eng.probGe70}%`);
}

main().catch((err) => {
  console.error("Build failed:", err?.stack || err?.message || err);
  process.exit(1);
});
