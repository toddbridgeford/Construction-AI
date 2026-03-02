// scripts/build_signal_api_latest.mjs
// Build Signal API v1 from dashboard_latest.json (deterministic, no new deps)

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd());
const IN_PATH = path.join(ROOT, process.env.IN_PATH || "dashboard_latest.json");
const OUT_PATH = path.join(ROOT, process.env.OUT_PATH || "signal_api_latest.json");

function mustReadJson(p) {
  if (!fs.existsSync(p)) throw new Error(`Missing input file: ${p}`);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

function riskStateDotFromScore(x) {
  if (x == null) return "🟡";
  if (x >= 70) return "🔴";
  if (x >= 60) return "🟡";
  return "🟢";
}

function mapZoneToBranded(zone) {
  // dashboard zone: Expansion | Late Expansion | Slowdown | Tightening | Freeze Risk
  // Signal API zone: Expansion Base | Late Cycle Build | Compression Phase | Tightening Cycle | Freeze Threshold
  if (!zone) return null;
  const z = String(zone).trim().toLowerCase();
  if (z === "expansion") return "Expansion Base";
  if (z === "late expansion") return "Late Cycle Build";
  if (z === "slowdown") return "Compression Phase";
  if (z === "tightening") return "Tightening Cycle";
  if (z === "freeze risk") return "Freeze Threshold";
  return null;
}

function mapArrow(a) {
  if (a === "↑" || a === "↓" || a === "→") return a;
  return "→";
}

function safeNum(x) {
  return typeof x === "number" && Number.isFinite(x) ? x : null;
}

function buildProvenanceFromDashboard(d) {
  // Best-effort. Your dashboard includes observed.sources with endpoints, but not release dates per series.
  // Keep stable structure; allow nulls.
  const src = [];

  // Prefer: observed.sources.* if present
  const sources = d?.observed?.sources || {};
  if (sources?.fred?.api) {
    src.push({
      name: "FRED",
      series: "macro_fred_pack",
      release_date: null,
      last_updated: null,
      url: sources.fred.api || null
    });
  }
  if (sources?.census_bps?.cbsa_page) {
    src.push({
      name: "Census BPS",
      series: "bps_monthly",
      release_date: null,
      last_updated: null,
      url: sources.census_bps.cbsa_page || null
    });
  }
  if (sources?.bls_laus?.base) {
    src.push({
      name: "BLS LAUS",
      series: "laus_unemployment",
      release_date: null,
      last_updated: null,
      url: sources.bls_laus.base || null
    });
  }
  if (src.length === 0) {
    src.push({
      name: "GitHub Build",
      series: "dashboard_latest.json",
      release_date: null,
      last_updated: null,
      url: null
    });
  }

  return {
    as_of: todayISODate(),
    sources: src
  };
}

function minimalValidate(out) {
  // No AJV; keep zero deps. Fail fast on obvious schema breaks.
  const reqTop = [
    "meta",
    "provenance",
    "indices",
    "ecosystem_pulse",
    "thermometer",
    "heatmap",
    "regime",
    "actions",
    "diagnostics"
  ];
  for (const k of reqTop) {
    if (!(k in out)) throw new Error(`Signal API missing top-level key: ${k}`);
  }
  if (out.meta.version !== "signal_api_v1") throw new Error("meta.version must be signal_api_v1");
  if (!["structural", "web_fetch", "data_assisted"].includes(out.meta.mode)) {
    throw new Error("meta.mode invalid");
  }
  if (!Array.isArray(out.heatmap.regions) || out.heatmap.regions.length < 1) {
    throw new Error("heatmap.regions must contain at least 1 region");
  }
}

function main() {
  const d = mustReadJson(IN_PATH);

  const runDate = todayISODate();

  const cpiHeadline = safeNum(d?.cpi?.headline);
  const cpiZone = d?.cpi?.zone || null;
  const delta3m = safeNum(d?.cpi?.delta_3m);
  const momentum = d?.cpi?.momentum || "Unknown";

  const trends = d?.ui?.trends || {};
  const cpiArrow = mapArrow(trends?.cpi?.arrow);

  const capital = safeNum(d?.cpi?.components?.capital);
  const pipeline = safeNum(d?.cpi?.components?.pipeline);
  const trade = safeNum(d?.cpi?.components?.trade);
  const materials = safeNum(d?.cpi?.components?.materials);
  const regulatory = safeNum(d?.cpi?.components?.regulatory);
  const macro = safeNum(d?.cpi?.components?.macro_sentiment);

  const overlays = d?.cpi?.components?.overlays || {};
  const stockOverlay = safeNum(overlays?.stock_overlay);
  const newsOverlay = safeNum(overlays?.news_pressure_overlay);
  const energyOverlay = safeNum(overlays?.energy_overlay);

  const overlayTriggers = [];
  let overlayPoints = 0;
  if ((stockOverlay || 0) > 0) {
    overlayTriggers.push(`stock_overlay_${stockOverlay}`);
    overlayPoints += stockOverlay;
  }
  if ((newsOverlay || 0) > 0) {
    overlayTriggers.push(`news_overlay_${newsOverlay}`);
    overlayPoints += newsOverlay;
  }
  if ((energyOverlay || 0) > 0) {
    overlayTriggers.push(`energy_overlay_${energyOverlay}`);
    overlayPoints += energyOverlay;
  }

  const riskDot = riskStateDotFromScore(cpiHeadline);
  const brandedZone = mapZoneToBranded(cpiZone);

  const regimePrimary = d?.regime?.primary || "";
  const regimeModifier = d?.regime?.modifier || "";
  const regimeConfidence = d?.regime?.confidence || "medium";

  const thermoActive = Boolean(d?.risk_thermometer_mode || d?.cpi?.risk_thermometer_mode);
  const triggerReason = [];
  if (thermoActive) triggerReason.push("risk_thermometer_mode_active");
  if (Boolean(d?.cpi?.freeze_risk)) triggerReason.push("freeze_risk_true");
  if ((delta3m ?? 0) >= 8) triggerReason.push("delta_3m_accelerating");
  if ((capital ?? 0) >= 80) triggerReason.push("capital_override_band");

  // Ecosystem pulse mapping from your dashboard output
  const ep = d?.ecosystem_pulse || {};
  const ecosystem_pulse = {
    home_builders: ep?.builders?.state || "🟡",
    architects: ep?.architects?.state || "🟡",
    general_contractors: ep?.general_contractors?.state || "🟡",
    distributors: ep?.distributors?.state || "🟡",
    manufacturers: ep?.manufacturers?.state || "🟡"
  };

  // Heatmap: minimal single-region row (national by default)
  const regionName = process.env.REGION_NAME || "National";
  const heatmapRow = {
    name: regionName,
    velocity: cpiArrow,
    pressure: riskDot,
    capital: riskStateDotFromScore(capital),
    residential: "🟡",
    institutional: "🟡",
    contractors: ecosystem_pulse.general_contractors,
    distribution: ecosystem_pulse.distributors,
    manufacturing: ecosystem_pulse.manufacturers
  };

  const out = {
    meta: {
      system: "Construction Intelligence OS",
      version: "signal_api_v1",
      mode: "data_assisted",
      run_date: runDate,
      region: {
        name: process.env.REGION_LABEL || "United States",
        geo_id: null
      }
    },
    provenance: buildProvenanceFromDashboard(d),
    indices: {
      pressure_index: {
        value: cpiHeadline,
        direction: cpiArrow,
        zone: brandedZone,
        delta_3m: delta3m,
        momentum_band: momentum || "Unknown",
        risk_state: riskDot,
        drivers: {
          capital,
          pipeline,
          trade,
          materials,
          regulatory,
          macro
        },
        subindices: {
          cpi_sf: safeNum(d?.cpi?.sf),
          cpi_mf: safeNum(d?.cpi?.mf),
          cpi_inst: safeNum(d?.cpi?.inst),
          cpi_infra: safeNum(d?.cpi?.infra),
          cpi_r: safeNum(d?.cpi?.r),
          cpi_i: safeNum(d?.cpi?.i)
        },
        divergences: {
          r_minus_i: safeNum(d?.cpi?.divergences?.r_minus_i),
          sf_minus_mf: safeNum(d?.cpi?.divergences?.sf_minus_mf),
          inst_minus_infra: safeNum(d?.cpi?.divergences?.inst_minus_infra)
        }
      },
      capital_stress_index: {
        value: capital,
        risk_state: riskStateDotFromScore(capital),
        overlays: {
          active_triggers: overlayTriggers,
          overlay_points: Math.round(overlayPoints)
        }
      },
      residential_index: {
        value: null,
        risk_state: "🟡",
        bifurcation: {
          single_family: "🟡",
          multifamily: "🟡"
        }
      },
      institutional_infra_index: {
        value: null,
        risk_state: "🟡",
        overlays: { active_triggers: [], overlay_points: 0 }
      },
      contractor_margin_index: {
        value: trade,
        risk_state: riskStateDotFromScore(trade),
        overlays: { active_triggers: [], overlay_points: 0 }
      },
      distributor_inventory_index: {
        value: null,
        risk_state: ecosystem_pulse.distributors,
        overlays: { active_triggers: [], overlay_points: 0 }
      },
      manufacturer_pricing_index: {
        value: null,
        risk_state: ecosystem_pulse.manufacturers,
        overlays: { active_triggers: [], overlay_points: 0 }
      }
    },
    ecosystem_pulse,
    thermometer: {
      active: thermoActive,
      trigger_reason: triggerReason,
      display: {
        cpi_value: cpiHeadline,
        zone: brandedZone,
        delta_3m: delta3m,
        risk_state: riskDot
      }
    },
    heatmap: {
      as_of: runDate,
      regions: [heatmapRow]
    },
    regime: {
      cycle_state: String(regimePrimary || ""),
      modifier: String(regimeModifier || ""),
      confidence: ["low", "medium", "high"].includes(regimeConfidence) ? regimeConfidence : "medium",
      inflection_triggers: [
        { name: "Freeze Threshold", condition: "CPI >= 76", active: Boolean((cpiHeadline ?? 0) >= 76) },
        { name: "Acceleration", condition: "Δ3m >= +8", active: Boolean((delta3m ?? 0) >= 8) },
        { name: "Capital Override", condition: "Capital >= 80", active: Boolean((capital ?? 0) >= 80) }
      ]
    },
    actions: {
      strategic_posture: Array.isArray(d?.ui?.alerts)
        ? d.ui.alerts.map((a) => `${a.title}: ${a.message}`).slice(0, 8)
        : [],
      decision_delta: []
    },
    diagnostics: {
      missing_inputs: [],
      non_deterministic_blocks: [],
      notes: ["Built deterministically from dashboard_latest.json"]
    }
  };

  minimalValidate(out);

  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2), "utf8");
  console.log(`Wrote ${OUT_PATH}`);
}

main();
