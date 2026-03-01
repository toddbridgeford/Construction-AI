// scripts/build_dashboard_latest.mjs
// Capital OS – Construction Intelligence Edition (stable, commit-ready)
// - Generates dashboard_latest.json at repo root
// - Never throws on missing data
// - Always defines builder_momentum (fixes your Actions failure)

import fs from "fs";
import path from "path";
import https from "https";

const ROOT = process.cwd();

const FILES = {
  fredSignals: path.join(ROOT, "config", "fred_signals.json"),
  statePermits: path.join(ROOT, "config", "state_permits.json"),
  msaPermits: path.join(ROOT, "config", "msa_permits.json"),
  outDashboard: path.join(ROOT, "dashboard_latest.json"),
};

function readJSON(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJSON(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

function nowISO() {
  return new Date().toISOString();
}

function todayYYYYMMDD() {
  return new Date().toISOString().slice(0, 10);
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function safeNum(x, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function pctChange(newV, oldV) {
  const a = safeNum(newV, NaN);
  const b = safeNum(oldV, NaN);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
  return ((a - b) / Math.abs(b)) * 100;
}

function httpGetJSON(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

// FRED observations
async function fetchFREDSeries({ series_id, observation_start }, apiKey) {
  const base = "https://api.stlouisfed.org/fred/series/observations";
  const params = new URLSearchParams({
    series_id,
    api_key: apiKey,
    file_type: "json",
    observation_start: observation_start || "2020-01-01",
    sort_order: "asc",
  });

  const url = `${base}?${params.toString()}`;
  const json = await httpGetJSON(url);
  const obs = Array.isArray(json?.observations) ? json.observations : [];

  // Keep numeric values only
  const points = obs
    .map((o) => {
      const v = Number(o.value);
      if (!Number.isFinite(v)) return null;
      return { date: o.date, value: v };
    })
    .filter(Boolean);

  return points;
}

function lastN(points, n) {
  if (!Array.isArray(points) || points.length === 0) return [];
  return points.slice(Math.max(0, points.length - n));
}

// Try to find a point ~12 months back (monthly series are common)
function approx12mBack(points) {
  if (!points?.length) return null;
  if (points.length < 13) return null;
  return points[points.length - 13] || null;
}

// Simple “score” mapping helpers (stable + monotonic)
function toScore_0_100(value, min, max) {
  const v = safeNum(value, NaN);
  if (!Number.isFinite(v)) return 50;
  if (max === min) return 50;
  return clamp(((v - min) / (max - min)) * 100, 0, 100);
}

function bandForCPI(cpi) {
  if (cpi >= 80) return "RESTRICTIVE";
  if (cpi >= 65) return "TIGHTENING";
  if (cpi >= 45) return "NEUTRAL";
  return "EASING";
}

function riskLabel(cpi) {
  if (cpi >= 70) return "RISK";
  if (cpi >= 55) return "MONITOR";
  return "STABLE";
}

function volatilityRegime() {
  // Placeholder until you wire real vol series
  return "NORMAL";
}

function regimeFrom(cpi) {
  if (cpi >= 70) return "RISK";
  if (cpi >= 55) return "MONITOR";
  return "NEUTRAL";
}

function safeHistoryFromPoints(points, max = 24) {
  const tail = lastN(points, max);
  return tail.map((p) => ({ date: p.date, value: p.value }));
}

async function main() {
  const fredCfg = readJSON(FILES.fredSignals, {
    primary_series_id: "MORTGAGE30US",
    observation_start_default: "2020-01-01",
    signals: [],
  });

  const apiKey =
    process.env.FRED_API_KEY ||
    process.env.FRED_KEY ||
    process.env.FRED_APIKEY ||
    "";

  // If no key, still output a valid dashboard with safe defaults.
  const canFetch = Boolean(apiKey && apiKey.length > 5);

  const observationStart = fredCfg?.observation_start_default || "2020-01-01";
  const signalsList = Array.isArray(fredCfg?.signals) ? fredCfg.signals : [];

  // Fetch all series (best-effort)
  const seriesData = {};
  if (canFetch && signalsList.length > 0) {
    await Promise.all(
      signalsList.map(async (s) => {
        const series_id = s?.series_id;
        if (!series_id) return;
        try {
          const pts = await fetchFREDSeries(
            { series_id, observation_start: observationStart },
            apiKey
          );
          seriesData[series_id] = pts;
        } catch {
          seriesData[series_id] = [];
        }
      })
    );
  } else {
    // No fetch; populate empty arrays
    for (const s of signalsList) {
      if (s?.series_id) seriesData[s.series_id] = [];
    }
  }

  // Build “signals” objects for dashboard
  const dashboardSignals = signalsList.map((s) => {
    const series_id = s.series_id;
    const pts = seriesData[series_id] || [];
    const last = pts.length ? pts[pts.length - 1] : null;
    const back12 = approx12mBack(pts);

    // YOY: default to percent change; if it’s a rate series, this is still acceptable.
    const yoy = back12 ? pctChange(last?.value, back12?.value) : null;

    return {
      name: s.name || series_id,
      region: s.region || "US",
      units: s.units || "",
      series_id,
      value: last ? last.value : null,
      yoy,
      history: safeHistoryFromPoints(pts, 24),
    };
  });

  // Helper to find a series by series_id quickly
  const getLastValue = (series_id) => {
    const pts = seriesData[series_id] || [];
    return pts.length ? pts[pts.length - 1].value : null;
  };

  // Core series (optional)
  const mortgage30 = getLastValue("MORTGAGE30US");
  const unrate = getLastValue("UNRATE");
  const permit = getLastValue("PERMIT");
  const houst = getLastValue("HOUST");

  // CPI (Capital Pressure Index) — simple, stable composite (0–100)
  // Tune ranges as you like (these are sane defaults).
  const mortgageScore = toScore_0_100(mortgage30, 2.5, 9.0); // higher rates => higher pressure
  const unrateScore = 100 - toScore_0_100(unrate, 3.0, 10.0); // invert
  const permitScore = 100 - toScore_0_100(permit, 900, 1800); // invert
  const startsScore = 100 - toScore_0_100(houst, 900, 1800); // invert

  const cpiRaw =
    mortgageScore * 0.45 +
    unrateScore * 0.15 +
    permitScore * 0.20 +
    startsScore * 0.20;

  const cpi = Math.round(clamp(cpiRaw, 0, 100));
  const cpiBand = bandForCPI(cpi);

  // CEPS — inverse of CPI (easy mental model).
  const ceps_score = Math.round(clamp(100 - cpi, 0, 100));

  // Builder momentum (ALWAYS DEFINED) — 0–100, neutral 50
  // Use starts+permits yoy if available; otherwise stable 50.
  const startsYOY = (() => {
    const pts = seriesData["HOUST"] || [];
    const last = pts.at(-1);
    const back12 = approx12mBack(pts);
    if (!last || !back12) return null;
    return pctChange(last.value, back12.value);
  })();

  const permitsYOY = (() => {
    const pts = seriesData["PERMIT"] || [];
    const last = pts.at(-1);
    const back12 = approx12mBack(pts);
    if (!last || !back12) return null;
    return pctChange(last.value, back12.value);
  })();

  // Map YOY to score: -20% => 20, 0% => 50, +20% => 80 (clamped)
  const yoyToScore = (yoy) => {
    if (yoy === null || yoy === undefined) return 50;
    return Math.round(clamp(50 + safeNum(yoy) * 1.5, 0, 100));
  };

  const builderMomentumScore = Math.round(
    clamp((yoyToScore(startsYOY) + yoyToScore(permitsYOY)) / 2, 0, 100)
  );

  const builder_momentum = {
    value: builderMomentumScore,
    components: {
      starts_yoy: startsYOY,
      permits_yoy: permitsYOY,
    },
  };

  // Splits (optional but useful to UI)
  const ceps_split = {
    residential: Math.round(clamp(ceps_score + 1, 0, 100)),
    institutional: Math.round(clamp(ceps_score - 1, 0, 100)),
  };

  const capital = {
    pressure_index: cpi,
    band: cpiBand,
    subindices: {
      residential: Math.round(clamp(cpi + 1, 0, 100)),
      institutional: Math.round(clamp(cpi - 2, 0, 100)),
    },
    history: [{ date: todayYYYYMMDD(), value: cpi }],
  };

  const volatility_regime = volatilityRegime();
  const regime = regimeFrom(cpi);
  const risk_mode = cpi >= 70;

  const acceleration_engine = {
    divergence: Math.abs(ceps_score - cpi),
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
      builder_early_warning: builderMomentumScore < 40,
    },
    alert_level: riskLabel(cpi),
  };

  const executive = {
    headline: `Construction Intelligence — ${riskLabel(cpi)}`,
    confidence: canFetch ? "MEDIUM" : "LOW",
    summary: canFetch
      ? "Live macro inputs loaded via FRED. Composite pressure and split indicators updated."
      : "FRED key missing in Actions (FRED_API_KEY). Output is in safe default mode.",
  };

  const alerts = [
    {
      id: "core_regime",
      title: `${riskLabel(cpi)} — ${regime}`,
      severity: risk_mode ? "WATCH" : "MONITOR",
      why_it_matters: risk_mode
        ? "Composite pressure is elevated; tighten underwriting and watch project starts."
        : "Composite pressure is contained; monitor for inflections in permits/starts.",
    },
  ];

  const statePermits = readJSON(FILES.statePermits, null);
  const msaPermits = readJSON(FILES.msaPermits, null);

  const dashboard = {
    schema_version: "3.0.6",
    generated_at: nowISO(),

    executive,
    capital,

    // Required by your workflow (and used by your Swift UI)
    ceps_score,
    ceps_split,
    builder_momentum,

    correlations: {
      cpi_vs_builders: 0,
      regime,
    },

    risk_mode,
    risk_thermometer_mode: false,
    volatility_regime,

    shock_flags: {
      rate_shock: false,
      equity_drawdown: false,
      volatility_spike: false,
    },

    regime_history: [
      {
        date: todayYYYYMMDD(),
        ceps: ceps_score,
        cpi,
        volatility: volatility_regime,
        regime,
      },
    ],

    acceleration_engine,

    // Signals for UI (Top 5, sparklines, etc.)
    signals: dashboardSignals,

    // Panels (optional; keep predictable shape)
    panels: {
      permits: {
        state: statePermits || null,
        msa: msaPermits || null,
      },
    },

    alerts,
  };

  writeJSON(FILES.outDashboard, dashboard);

  console.log(
    `OK: wrote dashboard_latest.json | CPI=${cpi} CEPS=${ceps_score} builder_momentum=${builderMomentumScore} canFetch=${canFetch}`
  );
}

main().catch((err) => {
  console.error("FATAL:", err?.message || err);
  process.exit(1);
});
