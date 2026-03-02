// scripts/build_markets_signal_api_latest.mjs
// Multi-market Signal API v1 builder (zero deps, deterministic)
//
// v1 behavior:
// - Creates dist/markets/index.json
// - Creates dist/markets/<marketId>/signal_api_latest.json for each market
// - Uses national root signal_api_latest.json as canonical fallback when market scoring not implemented

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const MARKETS_PATH = path.join(ROOT, "config", "markets.json");
const DIST_DIR = path.join(ROOT, "dist", "markets");
const INDEX_PATH = path.join(DIST_DIR, "index.json");

const NATIONAL_SIGNAL_PATH = path.join(ROOT, "signal_api_latest.json"); // produced by your existing pipeline

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8");
}

function isoDate() {
  return new Date().toISOString().slice(0, 10);
}

function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

// Minimal Signal API v1 skeleton (matches your schema philosophy: required keys, nulls allowed)
function makeMarketSignalSkeleton({ market, runDate, mode, provenanceSources }) {
  return {
    meta: {
      system: "Construction Intelligence OS",
      version: "signal_api_v1",
      mode, // structural|web_fetch|data_assisted
      run_date: runDate,
      region: {
        name: market.label,
        geo_id: market.cbsa ?? null
      }
    },
    provenance: {
      as_of: runDate,
      sources: provenanceSources
    },
    indices: {
      pressure_index: {
        value: null,
        direction: "→",
        zone: null,
        delta_3m: null,
        momentum_band: "Unknown",
        risk_state: "🟡",
        drivers: {
          capital: null,
          pipeline: null,
          trade: null,
          materials: null,
          regulatory: null,
          macro: null
        },
        subindices: {
          cpi_sf: null,
          cpi_mf: null,
          cpi_inst: null,
          cpi_infra: null,
          cpi_r: null,
          cpi_i: null
        },
        divergences: {
          r_minus_i: null,
          sf_minus_mf: null,
          inst_minus_infra: null
        }
      },
      capital_stress_index: {
        value: null,
        risk_state: "🟡",
        overlays: { active_triggers: [], overlay_points: 0 }
      },
      residential_index: {
        value: null,
        risk_state: "🟡",
        bifurcation: { single_family: "🟡", multifamily: "🟡" }
      },
      institutional_infra_index: {
        value: null,
        risk_state: "🟡",
        overlays: { active_triggers: [], overlay_points: 0 }
      },
      contractor_margin_index: {
        value: null,
        risk_state: "🟡",
        overlays: { active_triggers: [], overlay_points: 0 }
      },
      distributor_inventory_index: {
        value: null,
        risk_state: "🟡",
        overlays: { active_triggers: [], overlay_points: 0 }
      },
      manufacturer_pricing_index: {
        value: null,
        risk_state: "🟡",
        overlays: { active_triggers: [], overlay_points: 0 }
      }
    },
    ecosystem_pulse: {
      home_builders: "🟡",
      architects: "🟡",
      general_contractors: "🟡",
      distributors: "🟡",
      manufacturers: "🟡"
    },
    thermometer: {
      active: false,
      trigger_reason: ["Market CPI not computed in v1 (mapping not provided)"],
      display: { cpi_value: null, zone: null, delta_3m: null, risk_state: "🟡" }
    },
    heatmap: {
      as_of: runDate,
      regions: [
        {
          name: market.id,
          velocity: "→",
          pressure: "🟡",
          capital: "🟡",
          residential: "🟡",
          institutional: "🟡",
          contractors: "🟡",
          distribution: "🟡",
          manufacturing: "🟡"
        }
      ]
    },
    regime: {
      cycle_state: "",
      modifier: "",
      confidence: "medium",
      inflection_triggers: [
        { name: "Freeze Threshold", condition: "CPI >= 76", active: false },
        { name: "Acceleration", condition: "Δ3m >= +8", active: false },
        { name: "Capital Override", condition: "Capital >= 80", active: false }
      ]
    },
    actions: { strategic_posture: [], decision_delta: [] },
    diagnostics: {
      missing_inputs: ["Market-specific deterministic scoring mappings (capital/pipeline/trade/materials/regulatory/macro)"],
      non_deterministic_blocks: [],
      notes: ["Multi-market v1: skeleton payload emitted deterministically."]
    }
  };
}

function main() {
  if (!exists(MARKETS_PATH)) throw new Error(`Missing ${MARKETS_PATH}`);
  if (!exists(NATIONAL_SIGNAL_PATH)) {
    throw new Error(
      `Missing ${NATIONAL_SIGNAL_PATH}. Build national signal_api_latest.json first, then run multi-market script.`
    );
  }

  const runDate = isoDate();
  const cfg = readJson(MARKETS_PATH);

  const markets = Array.isArray(cfg.markets) ? cfg.markets : [];
  if (markets.length === 0) throw new Error("config/markets.json has no markets[]");

  // Build registry
  const registry = {
    version: 1,
    generated_at: new Date().toISOString(),
    default_market: cfg.default_market || "national",
    markets: markets.map((m) => ({
      id: m.id,
      label: m.label,
      type: m.type,
      cbsa: m.cbsa ?? null,
      path: `dist/markets/${m.id}/signal_api_latest.json`
    }))
  };

  fs.mkdirSync(DIST_DIR, { recursive: true });
  writeJson(INDEX_PATH, registry);

  // Sources: reuse national provenance where possible
  const national = readJson(NATIONAL_SIGNAL_PATH);
  const provenanceSources = national?.provenance?.sources ?? [
    { name: "GitHub Build", series: "signal_api_latest.json", release_date: null, last_updated: null, url: null }
  ];

  // Write each market payload
  for (const market of markets) {
    const outPath = path.join(DIST_DIR, market.id, "signal_api_latest.json");

    // v1: if market is national, copy the national canonical payload into dist for symmetry
    if (market.id === "national") {
      writeJson(outPath, national);
      continue;
    }

    // v1: create skeleton payload (until you supply deterministic market mappings)
    const skeleton = makeMarketSignalSkeleton({
      market,
      runDate,
      mode: national?.meta?.mode || "data_assisted",
      provenanceSources
    });
    writeJson(outPath, skeleton);
  }

  console.log(`Wrote ${INDEX_PATH}`);
  console.log(`Wrote ${markets.length} market payload(s) under dist/markets/`);
}

main();
