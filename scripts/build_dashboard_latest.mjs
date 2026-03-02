#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());
const outputPath = path.resolve(root, process.env.OUT_PATH || "dashboard_latest.json");

const now = new Date().toISOString();

function clamp0to100(value, fallback = 50) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function computeMomentum(delta3m) {
  if (delta3m >= 5) return "Accelerating";
  if (delta3m <= -5) return "Cooling";
  return "Stable";
}

function computeZone(score) {
  if (score >= 60) return "Stress";
  if (score >= 35) return "Slowdown";
  return "Expansion";
}

const components = {
  capital: clamp0to100(process.env.CPI_CAPITAL ?? 44),
  pipeline: clamp0to100(process.env.CPI_PIPELINE ?? 47),
  trade: clamp0to100(process.env.CPI_TRADE ?? 50),
  materials: clamp0to100(process.env.CPI_MATERIALS ?? 52),
  regulatory: clamp0to100(process.env.CPI_REGULATORY ?? 46),
  macro_sentiment: clamp0to100(process.env.CPI_MACRO_SENTIMENT ?? 49)
};

const weighted =
  components.capital * 0.25 +
  components.pipeline * 0.2 +
  components.trade * 0.15 +
  components.materials * 0.15 +
  components.regulatory * 0.1 +
  components.macro_sentiment * 0.15;

const headline = clamp0to100(weighted);
const delta3m = Number(process.env.CPI_DELTA_3M ?? 2);
const zone = computeZone(headline);
const momentum = computeMomentum(delta3m);
const volatilityRegime = zone === "Stress" ? "STRESS" : zone === "Slowdown" ? "WATCH" : "NORMAL";

const payload = {
  schema_version: "1.0.0",
  generated_at: now,
  executive: {
    headline: "Construction Intelligence",
    confidence: "medium",
    summary: "Pressure stable. Monitor capital, permits, and macro sentiment for regime shifts."
  },
  cpi: {
    headline,
    zone,
    delta_3m: delta3m,
    momentum,
    components
  },
  volatility_regime: volatilityRegime,
  regime_history: [
    {
      date: now.slice(0, 10),
      primary_regime: zone,
      secondary_modifier: "Neutral",
      confidence: "medium",
      cpi_level: headline,
      capital_score: components.capital,
      pipeline_score: components.pipeline,
      flip_trigger: null,
      duration_days: 1,
      status: "Active"
    }
  ],
  ui: {
    alerts: [
      {
        severity: volatilityRegime === "STRESS" ? "CRITICAL" : volatilityRegime === "WATCH" ? "WATCH" : "NORMAL",
        title: "Dashboard updated",
        message: `Generated at ${now}`
      }
    ],
    cards: [
      {
        id: "headline_cpi",
        title: "Construction Pressure",
        value: headline,
        severity: volatilityRegime === "STRESS" ? "CRITICAL" : volatilityRegime === "WATCH" ? "WATCH" : "NORMAL"
      }
    ],
    heat_strip: {
      cpi: headline,
      zone,
      delta_3m: delta3m,
      momentum
    }
  }
};

fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`Wrote ${path.relative(root, outputPath)}`);
