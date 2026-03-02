// scripts/build_signal_api_latest.mjs
// National Signal API v1 builder (deterministic, zero deps)
//
// Input: dashboard_latest.json
// Output: signal_api_latest.json

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const IN_PATH = path.join(ROOT, process.env.IN_PATH || "dashboard_latest.json");
const OUT_PATH = path.join(ROOT, process.env.OUT_PATH || "signal_api_latest.json");
const REGION_LABEL = process.env.REGION_LABEL || "United States";
const REGION_NAME = process.env.REGION_NAME || "National";

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

function normalizeSources(dashboard) {
  const observedSources = dashboard?.observed?.sources;
  if (!observedSources || typeof observedSources !== "object") {
    return [
      {
        name: "dashboard_latest",
        series: "dashboard_latest.json",
        release_date: dashboard?.as_of || null,
        last_updated: dashboard?.generated_at || null,
        url: null
      }
    ];
  }

  return Object.entries(observedSources).map(([name, source]) => ({
    name,
    series: source?.api || source?.base || name,
    release_date: dashboard?.as_of || null,
    last_updated: dashboard?.generated_at || null,
    url: source?.api || source?.base || null
  }));
}

function main() {
  if (!exists(IN_PATH)) {
    throw new Error(`Missing input file: ${IN_PATH}`);
  }

  const dashboard = readJson(IN_PATH);

  const cpiHeadline = safeNumber(dashboard?.cpi?.headline, 50);
  const cpiDelta3m = safeNumber(dashboard?.cpi?.delta_3m, 0);
  const riskState = riskStateFromValue(cpiHeadline);
  const zone = zoneFromValue(cpiHeadline);

  const capital = safeNumber(dashboard?.cpi?.components?.capital, null);
  const pipeline = safeNumber(dashboard?.cpi?.components?.pipeline, null);
  const trade = safeNumber(dashboard?.cpi?.components?.trade, null);
  const materials = safeNumber(dashboard?.cpi?.components?.materials, null);
  const regulatory = safeNumber(dashboard?.cpi?.components?.regulatory, null);
  const macro = safeNumber(dashboard?.cpi?.components?.macro_sentiment, null);

  const payload = {
    meta: {
      system: "Construction Intelligence OS",
      version: "signal_api_v1",
      mode: "data_assisted",
      run_date: dashboard?.as_of || new Date().toISOString().slice(0, 10),
      region: {
        label: REGION_LABEL,
        name: REGION_NAME
      }
    },
    provenance: {
      as_of: dashboard?.as_of || null,
      generated_at: dashboard?.generated_at || null,
      sources: normalizeSources(dashboard)
    },
    indices: {
      pressure_index: {
        value: cpiHeadline,
        direction: directionFromDelta(cpiDelta3m),
        zone,
        delta_3m: cpiDelta3m,
        momentum_band: dashboard?.cpi?.momentum || "Unknown",
        risk_state: riskState,
        drivers: { capital, pipeline, trade, materials, regulatory, macro },
        subindices: {
          cpi_sf: safeNumber(dashboard?.cpi?.cpi_sf, null),
          cpi_mf: safeNumber(dashboard?.cpi?.cpi_mf, null),
          cpi_inst: safeNumber(dashboard?.cpi?.cpi_inst, null),
          cpi_infra: safeNumber(dashboard?.cpi?.cpi_infra, null),
          cpi_r: safeNumber(dashboard?.cpi?.cpi_r, null),
          cpi_i: safeNumber(dashboard?.cpi?.cpi_i, null)
        },
        divergences: {
          r_minus_i: safeNumber(dashboard?.cpi?.divergences?.r_minus_i, null),
          sf_minus_mf: safeNumber(dashboard?.cpi?.divergences?.sf_minus_mf, null),
          inst_minus_infra: safeNumber(dashboard?.cpi?.divergences?.inst_minus_infra, null)
        }
      },
      capital_stress_index: {
        value: capital,
        risk_state: riskStateFromValue(capital),
        overlays: {
          active_triggers: [],
          overlay_points: safeNumber(dashboard?.cpi?.components?.overlays?.stock_overlay, 0)
        }
      },
      residential_index: {
        value: safeNumber(dashboard?.cpi?.cpi_r, null),
        risk_state: riskStateFromValue(dashboard?.cpi?.cpi_r),
        bifurcation: {
          single_family: riskStateFromValue(dashboard?.cpi?.cpi_sf),
          multifamily: riskStateFromValue(dashboard?.cpi?.cpi_mf)
        }
      },
      institutional_infra_index: {
        value: safeNumber(dashboard?.cpi?.cpi_i, null),
        risk_state: riskStateFromValue(dashboard?.cpi?.cpi_i),
        overlays: { active_triggers: [], overlay_points: safeNumber(dashboard?.market_intel?.news_pressure_overlay, 0) }
      }
    },
    regime: {
      cycle_state: dashboard?.regime_history_display?.[0]?.primary_regime || "",
      modifier: dashboard?.regime_history_display?.[0]?.secondary_modifier || "",
      confidence: dashboard?.executive?.confidence || "medium"
    },
    diagnostics: {
      missing_inputs: [],
      non_deterministic_blocks: [],
      notes: ["Built from dashboard_latest.json with defensive defaults."]
    }
  };

  writeJson(OUT_PATH, payload);
  console.log(`Wrote ${OUT_PATH}`);
}

main();
