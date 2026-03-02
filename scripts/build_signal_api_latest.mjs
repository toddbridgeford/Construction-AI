// scripts/build_signal_api_latest.mjs
// National Signal API v1 builder (hardened, deterministic, zero deps)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const IN_PATH = path.join(ROOT, process.env.IN_PATH || "dashboard_latest.json");
const OUT_PATH = path.join(ROOT, process.env.OUT_PATH || "signal_api_latest.json");
const REGION_LABEL = process.env.REGION_LABEL || "United States";
const REGION_NAME = process.env.REGION_NAME || "National";

// --------------------------------------------------
// Helpers
// --------------------------------------------------

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8");
}

function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

function safeNumber(value, fallback = null) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function riskStateFromValue(value) {
  const v = safeNumber(value, 50);
  if (v >= 76) return "🔴";
  if (v >= 61) return "🟠";
  if (v >= 46) return "🟡";
  return "🟢";
}

function directionFromDelta(delta) {
  const d = safeNumber(delta, 0);
  if (d > 0.2) return "↑";
  if (d < -0.2) return "↓";
  return "→";
}

function zoneFromValue(value) {
  const v = safeNumber(value, 50);
  if (v >= 76) return "freeze";
  if (v >= 61) return "elevated";
  if (v >= 46) return "watch";
  return "stable";
}

// --------------------------------------------------
// Provenance normalization
// --------------------------------------------------

function normalizeSources(dashboard) {
  const observedSources = dashboard?.observed?.sources;
  if (!observedSources || typeof observedSources !== "object") {
    return [
      {
        name: "dashboard_latest",
        series: "dashboard_latest.json",
        release_date: null,
        last_updated: dashboard?.generated_at || null,
        url: null
      }
    ];
  }

  return Object.entries(observedSources).map(([name, source]) => ({
    name,
    series: source?.api || source?.base || name,
    release_date: null,
    last_updated: dashboard?.generated_at || null,
    url: source?.api || source?.base || null
  }));
}

// --------------------------------------------------
// Main
// --------------------------------------------------

function main() {
  if (!exists(IN_PATH)) {
    throw new Error(`Missing input file: ${IN_PATH}`);
  }

  const dashboard = readJson(IN_PATH);

  const diagnostics = {
    missing_inputs: [],
    non_deterministic_blocks: [],
    notes: []
  };

  const cpiHeadline = safeNumber(dashboard?.cpi?.headline, null);
  if (cpiHeadline === null) diagnostics.missing_inputs.push("cpi.headline");

  const cpiDelta3m = safeNumber(dashboard?.cpi?.delta_3m, 0);

  const capital = safeNumber(dashboard?.cpi?.components?.capital, null);
  const pipeline = safeNumber(dashboard?.cpi?.components?.pipeline, null);
  const trade = safeNumber(dashboard?.cpi?.components?.trade, null);
  const materials = safeNumber(dashboard?.cpi?.components?.materials, null);
  const regulatory = safeNumber(dashboard?.cpi?.components?.regulatory, null);
  const macro = safeNumber(dashboard?.cpi?.components?.macro_sentiment, null);

  if (capital === null) diagnostics.missing_inputs.push("capital");
  if (pipeline === null) diagnostics.missing_inputs.push("pipeline");

  const stockOverlay = safeNumber(dashboard?.cpi?.components?.overlays?.stock_overlay, 0);
  const newsOverlay = safeNumber(dashboard?.cpi?.components?.overlays?.news_pressure_overlay, 0);
  const energyOverlay = safeNumber(dashboard?.cpi?.components?.overlays?.energy_overlay, 0);

  const overlayPoints = stockOverlay + newsOverlay + energyOverlay;

  // Correct regime extraction
  const regimePrimary = dashboard?.regime?.primary || null;
  const regimeModifier = dashboard?.regime?.modifier || null;
  const regimeConfidence = dashboard?.regime?.confidence || "medium";

  if (!regimePrimary) diagnostics.missing_inputs.push("regime.primary");

  const payload = {
    meta: {
      system: "Construction Intelligence OS",
      version: "signal_api_v1",
      mode: "data_assisted",
      run_date: new Date().toISOString().slice(0, 10),
      region: {
        label: REGION_LABEL,
        name: REGION_NAME
      }
    },

    provenance: {
      generated_at: dashboard?.generated_at || null,
      sources: normalizeSources(dashboard)
    },

    indices: {
      pressure_index: {
        value: cpiHeadline,
        direction: directionFromDelta(cpiDelta3m),
        zone: zoneFromValue(cpiHeadline),
        delta_3m: cpiDelta3m,
        momentum_band: dashboard?.cpi?.momentum || "Unknown",
        risk_state: riskStateFromValue(cpiHeadline),

        drivers: {
          capital,
          pipeline,
          trade,
          materials,
          regulatory,
          macro
        },

        overlays: {
          stock_overlay: stockOverlay,
          news_overlay: newsOverlay,
          energy_overlay: energyOverlay,
          total_overlay_points: overlayPoints
        },

        subindices: {
          cpi_sf: safeNumber(dashboard?.cpi?.cpi_sf, null),
          cpi_mf: safeNumber(dashboard?.cpi?.cpi_mf, null),
          cpi_inst: safeNumber(dashboard?.cpi?.cpi_inst, null),
          cpi_infra: safeNumber(dashboard?.cpi?.cpi_infra, null),
          cpi_r: safeNumber(dashboard?.cpi?.cpi_r, null),
          cpi_i: safeNumber(dashboard?.cpi?.cpi_i, null)
        }
      }
    },

    regime: {
      cycle_state: regimePrimary,
      modifier: regimeModifier,
      confidence: regimeConfidence
    },

    diagnostics
  };

  diagnostics.notes.push("Signal API built from dashboard_latest.json (hardened mode).");

  writeJson(OUT_PATH, payload);
  console.log(`Wrote ${OUT_PATH}`);
}

main();
