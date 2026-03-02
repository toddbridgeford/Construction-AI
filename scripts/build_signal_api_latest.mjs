// scripts/build_signal_api_latest.mjs
// Transforms dashboard_latest.json into signal_api_latest.json
// Clean machine-grade signal contract for Construction AI GPT

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd());
const DASHBOARD = path.join(ROOT, "dashboard_latest.json");
const OUTFILE = path.join(ROOT, "signal_api_latest.json");

function clamp(x, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, x));
}

function signalDirection(curr, prev) {
  if (curr == null || prev == null) return "stable";
  if (curr > prev) return "accelerating";
  if (curr < prev) return "cooling";
  return "stable";
}

function buildSignal(dashboard) {
  const cpi = dashboard.cpi;
  const pillars = cpi.components;

  const prev = dashboard.cpi.history?.[dashboard.cpi.history.length - 2]?.value ?? null;
  const direction = signalDirection(cpi.headline, prev);

  return {
    schema_version: "1.0.0",
    generated_at: dashboard.generated_at,

    geography: {
      country: "US",
      primary_market: "Denver"
    },

    regime: {
      primary: dashboard.regime_history_display?.previous_regime ?? null,
      risk_mode: dashboard.risk_mode,
      freeze_risk: cpi.freeze_risk,
      delta_3m: cpi.delta_3m,
      direction
    },

    cpi: {
      headline: cpi.headline,
      residential: cpi.cpi_r,
      institutional: cpi.cpi_i,
      sf: cpi.cpi_sf,
      mf: cpi.cpi_mf,
      inst: cpi.cpi_inst,
      infra: cpi.cpi_infra,
      zone: cpi.zone
    },

    pillars: {
      capital: pillars.capital,
      pipeline: pillars.pipeline,
      trade: pillars.trade,
      materials: pillars.materials,
      regulatory: pillars.regulatory,
      macro: pillars.macro_sentiment
    },

    overlays: {
      stock: pillars.overlays.stock_overlay,
      news: pillars.overlays.news_pressure_overlay,
      energy: pillars.overlays.energy_overlay
    },

    ecosystem_pressure: dashboard.ui?.ecosystem_pulse ?? null
  };
}

function main() {
  const dashboard = JSON.parse(fs.readFileSync(DASHBOARD, "utf8"));
  const signal = buildSignal(dashboard);

  fs.writeFileSync(OUTFILE, JSON.stringify(signal, null, 2));
  console.log("Wrote signal_api_latest.json");
}

main();
