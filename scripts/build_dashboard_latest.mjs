/**
 * scripts/build_dashboard_latest.mjs
 * Construction Intelligence OS — Dashboard Builder (Clean / Single-file)
 *
 * Inputs (repo canonical):
 * - config/fred_signals.json
 * - config/msa_permits.json (optional; used if you later wire it)
 * - config/state_permits.json (optional; used if you later wire it)
 * - framework/national_autonomous_run_orchestrator_v1.json (read/validate only)
 * - framework/national_execution_precedence_matrix_v1.json (read/validate only)
 *
 * Output:
 * - dashboard_latest.json (repo root)
 *
 * Env:
 * - FRED_API_KEY (optional but recommended)
 */

import fs from "fs";
import path from "path";
import process from "process";

// ---------------------------
// Paths
// ---------------------------
const ROOT = process.cwd();

const PATHS = {
  fredSignals: path.join(ROOT, "config", "fred_signals.json"),
  msaPermits: path.join(ROOT, "config", "msa_permits.json"),
  statePermits: path.join(ROOT, "config", "state_permits.json"),
  orchestrator: path.join(ROOT, "framework", "national_autonomous_run_orchestrator_v1.json"),
  precedence: path.join(ROOT, "framework", "national_execution_precedence_matrix_v1.json"),
  outDash: path.join(ROOT, "dashboard_latest.json"),
};

const FRED_API_KEY = process.env.FRED_API_KEY || "";

// ---------------------------
// Helpers
// ---------------------------
function die(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

function readJSON(filePath, { required = true } = {}) {
  if (!fs.existsSync(filePath)) {
    if (required) die(`Missing required file: ${path.relative(ROOT, filePath)}`);
    return null;
  }
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    die(`Invalid JSON: ${path.relative(ROOT, filePath)} → ${e.message}`);
  }
}

function writeJSON(filePath, obj) {
  const pretty = JSON.stringify(obj, null, 2) + "\n";
  fs.writeFileSync(filePath, pretty, "utf8");
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function round(n, d = 2) {
  if (n === null || n === undefined || Number.isNaN(n)) return null;
  const p = 10 ** d;
  return Math.round(n * p) / p;
}

function nowISO() {
  return new Date().toISOString();
}

function todayYMD() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function bandForCPI(v) {
  if (v >= 70) return "RESTRICTIVE";
  if (v >= 60) return "TIGHTENING";
  if (v >= 45) return "NEUTRAL";
  return "EASING";
}

function regimeForCore({ cpi, ceps }) {
  // Simple institutional regime classifier
  if (cpi >= 70 || ceps <= 35) return "RISK";
  if (cpi >= 60) return "TIGHTENING";
  if (cpi <= 40) return "EASING";
  return "NEUTRAL";
}

function alertLevelFromRegime(regime) {
  switch (regime) {
    case "RISK":
      return "WATCH";
    case "TIGHTENING":
      return "MONITOR";
    case "EASING":
      return "MONITOR";
    default:
      return "MONITOR";
  }
}

// ---------------------------
// FRED fetch (no dependencies)
// ---------------------------
async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} for ${url}\n${txt}`);
  }
  return res.json();
}

/**
 * Get latest observations for a series.
 * Returns array of { date: "YYYY-MM-DD", value: number|null } sorted ascending.
 */
async function fredObservations(seriesId, { limit = 120 } = {}) {
  // If no API key, return empty; caller will fall back.
  if (!FRED_API_KEY) return [];

  const url =
    "https://api.stlouisfed.org/fred/series/observations" +
    `?series_id=${encodeURIComponent(seriesId)}` +
    `&api_key=${encodeURIComponent(FRED_API_KEY)}` +
    `&file_type=json` +
    `&sort_order=asc` +
    `&limit=${limit}`;

  const j = await fetchJSON(url);
  const obs = Array.isArray(j?.observations) ? j.observations : [];

  return obs
    .map((o) => {
      const v = o?.value;
      const num = v === "." ? null : Number(v);
      return {
        date: o?.date ?? null,
        value: Number.isFinite(num) ? num : null,
      };
    })
    .filter((x) => x.date);
}

function latestNonNull(observations) {
  for (let i = observations.length - 1; i >= 0; i--) {
    if (observations[i]?.value !== null && observations[i]?.value !== undefined) {
      return observations[i];
    }
  }
  return null;
}

function valueOnOrBefore(observations, targetDate) {
  // observations asc
  for (let i = observations.length - 1; i >= 0; i--) {
    if (observations[i].date <= targetDate && observations[i].value != null) {
      return observations[i];
    }
  }
  return null;
}

function yoyFromMonthlySeries(observations) {
  // Use latest date and same date one year prior if available.
  const latest = latestNonNull(observations);
  if (!latest) return null;

  const [y, m, d] = latest.date.split("-").map((s) => Number(s));
  const priorY = y - 1;
  const priorDate = `${priorY}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  const prior = valueOnOrBefore(observations, priorDate);
  if (!prior || prior.value == null || prior.value === 0) return null;

  return ((latest.value - prior.value) / Math.abs(prior.value)) * 100;
}

// ---------------------------
// Input normalization
// ---------------------------
function normalizeFredSignals(raw) {
  // Allow:
  // - { signals: [...] }
  // - [...]
  // Each signal should have: series_id (or id), name, region, units
  const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.signals) ? raw.signals : null;
  if (!arr) die("config/fred_signals.json must be an array or { signals: [...] }");

  const out = arr
    .map((s, idx) => {
      const series_id = (s?.series_id || s?.id || "").trim();
      const name = (s?.name || s?.title || series_id || `Signal ${idx + 1}`).trim();
      const region = (s?.region || s?.geo || "US").trim();
      const units = (s?.units || s?.unit || "").trim();

      // optional tags
      const tags = Array.isArray(s?.tags) ? s.tags.map(String) : [];
      const isCapital = Boolean(s?.is_capital) || tags.includes("capital") || tags.includes("CPI");
      const isCeps = Boolean(s?.is_ceps) || tags.includes("ceps") || tags.includes("CEPS");

      return {
        series_id,
        name,
        region,
        units,
        tags,
        isCapital,
        isCeps,
      };
    })
    .filter((s) => s.series_id.length > 0);

  if (out.length === 0) die("config/fred_signals.json contains no valid series_id entries.");
  return out;
}

// ---------------------------
// Core scoring (simple, stable)
// ---------------------------
function scoreTo0_100(x, lo, hi) {
  // linear map [lo..hi] -> [0..100]
  if (x == null || !Number.isFinite(x)) return 0;
  const t = (x - lo) / (hi - lo);
  return Math.round(clamp(t, 0, 1) * 100);
}

function safeAvg(nums) {
  const v = nums.filter((n) => Number.isFinite(n));
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

// ---------------------------
// Build
// ---------------------------
async function main() {
  // Validate framework files exist (canonical)
  readJSON(PATHS.orchestrator, { required: true });
  readJSON(PATHS.precedence, { required: true });

  // Read configs
  const fredSignalsRaw = readJSON(PATHS.fredSignals, { required: true });
  const signalsCfg = normalizeFredSignals(fredSignalsRaw);

  // Pull observations for all signals (bounded)
  const signalsBuilt = [];
  const capitalCandidates = [];
  const cepsCandidates = [];

  for (const s of signalsCfg) {
    let obs = [];
    try {
      obs = await fredObservations(s.series_id, { limit: 120 });
    } catch (e) {
      // keep going; we will fall back
      obs = [];
    }

    const latest = latestNonNull(obs);
    const yoy = yoyFromMonthlySeries(obs);

    // Keep small history for sparklines (last 18 non-null)
    const hist = obs
      .filter((o) => o.value != null)
      .slice(-18)
      .map((o) => ({ date: o.date, value: o.value }));

    signalsBuilt.push({
      name: s.name,
      region: s.region,
      units: s.units,
      series_id: s.series_id,
      yoy: yoy != null ? round(yoy, 2) : null,
      history: hist.map((h) => ({ date: h.date, value: h.value })),
    });

    // Candidate streams for CPI/CEPS (if tagged)
    if (s.isCapital) capitalCandidates.push({ signal: s, yoy });
    if (s.isCeps) cepsCandidates.push({ signal: s, yoy });
  }

  // ---------------------------
  // CPI (Capital Pressure Index)
  // Stable rule:
  // - Use average YoY of tagged capital series if present
  // - Else average YoY of first 3 signals as a fallback
  // - Map YoY (-10 .. +10) to 0..100 (higher = more pressure)
  // ---------------------------
  const capitalYoys =
    capitalCandidates.length > 0
      ? capitalCandidates.map((c) => c.yoy).filter((x) => x != null)
      : signalsBuilt.slice(0, 3).map((s) => s.yoy).filter((x) => x != null);

  const capitalYoyAvg = safeAvg(capitalYoys);
  const cpi = scoreTo0_100(capitalYoyAvg, -10, 10);
  const cpiBand = bandForCPI(cpi);

  // Add a tiny CPI history (today + yesterday approximation if we have any signal history)
  const cpiHistory = [
    { date: todayYMD(), value: cpi },
  ];

  // ---------------------------
  // CEPS (Construction Early Pressure Score)
  // Stable rule:
  // - Use average YoY of tagged CEPS series if present
  // - Else use capitalYoyAvg as proxy
  // - Map YoY (-15 .. +15) to 0..100
  // ---------------------------
  const cepsYoys =
    cepsCandidates.length > 0
      ? cepsCandidates.map((c) => c.yoy).filter((x) => x != null)
      : (capitalYoys.length ? capitalYoys : []);

  const cepsYoyAvg = safeAvg(cepsYoys);
  const cepsScore = scoreTo0_100(cepsYoyAvg, -15, 15);

  // Splits (keep it deterministic; you can later wire real splits)
  const cepsSplit = {
    residential: Math.round(clamp(cepsScore + 2, 0, 100)),
    institutional: Math.round(clamp(cepsScore - 1, 0, 100)),
  };

  const capitalSubindices = {
    residential: Math.round(clamp(cpi + 1, 0, 100)),
    institutional: Math.round(clamp(cpi - 2, 0, 100)),
  };

  const builderMomentum = {
    value: Math.round(clamp(50 + (cepsScore - 50) * 0.2, 0, 100)),
  };

  // Volatility regime (simple; placeholder for real market ingest)
  const volatilityRegime = "NORMAL";

  // Shock flags (placeholders, deterministic)
  const shockFlags = {
    rate_shock: false,
    equity_drawdown: false,
    volatility_spike: false,
  };

  // Risk mode toggles
  const riskMode = cpi >= 70 || cpiBand === "RESTRICTIVE";

  const regime = regimeForCore({ cpi, ceps: cepsScore });

  // Acceleration engine (safe nulls unless you later add proper histories)
  const accelerationEngine = {
    divergence: Math.abs((cpi ?? 0) - (cepsScore ?? 0)),
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
    alert_level: alertLevelFromRegime(regime),
  };

  // Regime history (append-only style; we keep only one point here;
  // your UI can render and later you can extend builder to persist history)
  const regimeHistory = [
    {
      date: todayYMD(),
      ceps: cepsScore,
      cpi: cpi,
      volatility: volatilityRegime,
      regime: regime,
    },
  ];

  // Executive summary
  const headline =
    regime === "RISK"
      ? "Capital tightening risk elevated; protect backlog quality."
      : regime === "TIGHTENING"
      ? "Financing pressure building; prioritize resilient sectors."
      : regime === "EASING"
      ? "Capital conditions easing; selective expansion window."
      : "Conditions stable; monitor divergence for early inflection.";

  const summary =
    `CPI=${cpi} (${cpiBand}), CEPS=${cepsScore} (${regime}). ` +
    `Residential vs Institutional: CPI ${capitalSubindices.residential}/${capitalSubindices.institutional}, ` +
    `CEPS ${cepsSplit.residential}/${cepsSplit.institutional}.`;

  // Alerts (simple, boardroom-ready)
  const alerts = [
    {
      id: "macro-regime",
      title: `REGIME: ${regime}`,
      severity: regime === "RISK" ? "WATCH" : "MONITOR",
      why_it_matters:
        regime === "RISK"
          ? "Bid risk rises when capital tightens—expect slower awards and higher cancellations."
          : "Maintain discipline; watch for spread widening between CPI and CEPS.",
    },
  ];

  // Map to schema your Swift app already decodes:
  // - schema_version
  // - generated_at
  // - executive { headline, confidence, summary }
  // - capital { pressure_index, band, history, subindices }
  // - signals [ ... ]
  // Plus your Capital OS fields:
  // - ceps_score
  // - builder_momentum
  // - ceps_split
  // - correlations { cpi_vs_builders, regime }
  // - risk_mode
  // - volatility_regime
  // - shock_flags
  // - regime_history
  // - risk_thermometer_mode
  // - acceleration_engine
  const dashboard = {
    schema_version: "3.0.3",
    generated_at: nowISO(),

    executive: {
      headline,
      confidence: "MEDIUM",
      summary,
    },

    capital: {
      pressure_index: cpi,
      band: cpiBand,
      subindices: capitalSubindices,
      history: cpiHistory,
    },

    // Keep full list, UI can pick top 5
    signals: signalsBuilt.map((s) => ({
      name: s.name,
      region: s.region,
      units: s.units,
      yoy: s.yoy,
      history: s.history,
    })),

    alerts,

    // Capital OS fields (your UI already started rendering these)
    ceps_score: cepsScore,
    builder_momentum,
    ceps_split: cepsSplit,

    correlations: {
      cpi_vs_builders: 0,
      regime,
    },

    risk_mode: Boolean(riskMode),
    risk_thermometer_mode: Boolean(riskMode),

    volatility_regime: volatilityRegime,
    shock_flags: shockFlags,

    regime_history: regimeHistory,

    acceleration_engine: accelerationEngine,
  };

  writeJSON(PATHS.outDash, dashboard);

  // Console summary for Actions logs
  console.log("✅ Built dashboard_latest.json");
  console.log(`   schema_version: ${dashboard.schema_version}`);
  console.log(`   generated_at:   ${dashboard.generated_at}`);
  console.log(`   CPI:            ${cpi} (${cpiBand})`);
  console.log(`   CEPS:           ${cepsScore} (${regime})`);
  console.log(`   signals:        ${dashboard.signals.length}`);
  console.log(`   FRED_API_KEY:   ${FRED_API_KEY ? "SET" : "NOT SET (fallback mode)"}`);
}

main().catch((e) => die(e.stack || e.message || String(e)));
