// scripts/build_signal_api_latest.mjs
// Deterministic: dashboard_latest.json -> signal_api_latest.json (Signal API v1)
// Zero dependencies. Node 20+.
//
// Adds: Ecosystem Power Index (EPI) without breaking existing keys.
// EPI is a derived indicator designed to answer:
// “Who controls margin right now — GCs, Subs, or Distributors?”

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const IN_PATH = path.join(ROOT, process.env.IN_PATH || "artifacts/dashboard_latest.json");
const OUT_PATH = path.join(ROOT, process.env.OUT_PATH || "artifacts/signal_api_latest.json");

function mustReadJson(p) {
  if (!fs.existsSync(p)) throw new Error(`Missing input file: ${p}`);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

function safeNum(x) {
  return typeof x === "number" && Number.isFinite(x) ? x : null;
}

function clamp(n, lo, hi) {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return Math.max(lo, Math.min(hi, n));
}

function mapArrow(a) {
  if (a === "↑" || a === "↓" || a === "→") return a;
  return "→";
}

function riskDotFromScore(x) {
  if (x == null) return "🟡";
  if (x >= 70) return "🔴";
  if (x >= 60) return "🟡";
  return "🟢";
}

function mapZoneToBranded(zone) {
  if (!zone) return null;
  const z = String(zone).trim().toLowerCase();
  if (z === "expansion") return "Expansion Base";
  if (z === "late expansion") return "Late Cycle Build";
  if (z === "slowdown") return "Compression Phase";
  if (z === "tightening") return "Tightening Cycle";
  if (z === "freeze risk") return "Freeze Threshold";
  return null;
}

function buildProvenanceFromDashboard(d) {
  const src = [];
  const sources = d?.observed?.sources || {};
  if (sources?.fred?.api) {
    src.push({ name: "FRED", series: "macro_fred_pack", release_date: null, last_updated: null, url: sources.fred.api || null });
  }
  if (sources?.census_bps?.cbsa_page) {
    src.push({ name: "Census BPS", series: "bps_monthly", release_date: null, last_updated: null, url: sources.census_bps.cbsa_page || null });
  }
  if (sources?.bls_laus?.base) {
    src.push({ name: "BLS LAUS", series: "laus_unemployment", release_date: null, last_updated: null, url: sources.bls_laus.base || null });
  }
  if (src.length === 0) {
    src.push({ name: "GitHub Build", series: "dashboard_latest.json", release_date: null, last_updated: null, url: null });
  }
  return { as_of: todayISODate(), sources: src };
}

/**
 * Ecosystem Power Index (EPI) v1
 *
 * Purpose:
 * - Determine who is setting terms and capturing/defending margin:
 *   General Contractors vs Subcontractors vs Distributors.
 *
 * Deterministic inputs we reliably have (from Signal + Dashboard):
 * - CPI headline + delta_3m + capital stress proxy (from CPI components if present)
 * - News / stock / energy overlays if present
 * - (Optional) If dashboard has precomputed “signals” about pricing/inventory/backlog, we use them when found.
 *
 * Output:
 * - index: 0–100 where higher = tighter/rougher conditions and more concentrated control upstream
 * - actors: power 0–100 for GC / Subs / Distributors (relative)
 * - transmission: qualitative flow notes
 *
 * NOTE:
 * This is a first-principles deterministic model; when you later add real project/buyout/inventory feeds,
 * we can replace drivers with direct measures.
 */
function computeEcosystemPower({ cpi, delta3m, capital, pipeline, trade, overlays, dashboard }) {
  const drivers = [];

  // Base stress from CPI
  let base = 50;
  if (typeof cpi === "number") {
    if (cpi >= 76) { base += 20; drivers.push("freeze_risk_band"); }
    else if (cpi >= 61) { base += 12; drivers.push("tightening_band"); }
    else if (cpi >= 46) { base += 6; drivers.push("slowdown_band"); }
    else if (cpi <= 30) { base -= 6; drivers.push("expansion_band"); }
  }

  // Acceleration matters (who can push terms shifts faster under acceleration)
  if (typeof delta3m === "number") {
    if (delta3m >= 10) { base += 10; drivers.push("acceleration_10_plus"); }
    else if (delta3m >= 8) { base += 7; drivers.push("acceleration_8_plus"); }
    else if (delta3m <= -8) { base -= 6; drivers.push("rapid_relief"); }
  }

  // Capital stress: reduces subs/distributors flexibility, increases GC leverage
  if (typeof capital === "number") {
    if (capital >= 80) { base += 10; drivers.push("capital_override_band"); }
    else if (capital >= 70) { base += 6; drivers.push("capital_tight"); }
  }

  // Trade stress: if trade score high (execution tight), subs gain power; if trade low, GCs squeeze buyout
  if (typeof trade === "number") {
    if (trade >= 70) { base += 4; drivers.push("trade_execution_tight"); }
    else if (trade <= 45) { base -= 2; drivers.push("trade_soft"); }
  }

  // Overlays: news/stock/energy — treated as temporary pressure
  const overlayPoints =
    (safeNum(overlays?.stock_overlay) || 0) +
    (safeNum(overlays?.news_pressure_overlay) || 0) +
    (safeNum(overlays?.energy_overlay) || 0);
  if (overlayPoints > 0) drivers.push(`overlay_points_${Math.round(overlayPoints)}`);

  base = clamp(base + overlayPoints, 0, 100);

  // Actor power (0–100) relative — not “good/bad”, just control over terms/margin.
  // Heuristics:
  // - When capital tight + CPI high: GC power rises; subs weaken unless trade execution is tight.
  // - When trade execution tight (labor scarcity, schedule volatility): subs gain power.
  // - Distributors gain power mainly when supply tight; absent a supply signal, they tend to be mid/low.
  //
  // Deterministic but conservative: we do not hallucinate supply tightness.
  let gc = 55;
  let subs = 50;
  let dist = 45;

  if (typeof cpi === "number") {
    if (cpi >= 61) gc += 10;
    if (cpi <= 45) subs += 5;
  }
  if (typeof capital === "number") {
    if (capital >= 75) { gc += 10; subs -= 6; dist -= 4; }
  }
  if (typeof trade === "number") {
    if (trade >= 70) { subs += 12; gc -= 4; }
    if (trade <= 45) { gc += 6; subs -= 6; }
  }
  if (typeof pipeline === "number") {
    if (pipeline <= 45) { gc += 6; subs -= 3; dist -= 2; drivers.push("pipeline_soft"); }
    if (pipeline >= 65) { subs += 4; drivers.push("pipeline_hot"); }
  }

  // Optional: if dashboard contains inventory or pricing signals, incorporate deterministically if present.
  const inv = dashboard?.external?.distributor_inventory_signal;
  if (typeof inv === "number") {
    // inv higher = tighter inventory -> distributor power up
    dist += Math.round((inv - 50) / 5);
    drivers.push("inventory_signal_used");
  }

  gc = clamp(gc, 0, 100);
  subs = clamp(subs, 0, 100);
  dist = clamp(dist, 0, 100);

  // Normalize slightly so we can interpret tiers
  const tier = (x) => (x >= 70 ? "Tier A" : x >= 55 ? "Tier B" : "Tier C");

  // Transmission summary (simple, deterministic language)
  // Capital tightening flows: Distributor -> Subs -> GC (working capital)
  // Capacity tightening flows: Subs -> GC -> Owner (buyout)
  const transmission = [];
  if (typeof capital === "number" && capital >= 70) {
    transmission.push("Capital tight: credit pressure transmits Distributor → Subs → GC.");
  }
  if (typeof trade === "number" && trade >= 70) {
    transmission.push("Trade tight: capacity pressure transmits Subs → GC (buyout leverage shifts upward).");
  }
  if (transmission.length === 0) {
    transmission.push("Baseline: GC sets terms; subs compete; distributors transmit price/terms, not control.");
  }

  // Operator call
  let call = "GCs are primary control node; protect scope clarity and buyout timing.";
  const max = Math.max(gc, subs, dist);
  if (max === subs) call = "Subs are control node; lock capacity early and price risk explicitly.";
  if (max === dist) call = "Distributors are control node; secure allocation and credit terms early.";

  return {
    index: base,
    risk_state: riskDotFromScore(base),
    drivers,
    actors: [
      { actor: "general_contractors", power: gc, tier: tier(gc), control: gc === max },
      { actor: "subcontractors", power: subs, tier: tier(subs), control: subs === max },
      { actor: "distributors", power: dist, tier: tier(dist), control: dist === max }
    ],
    transmission,
    call
  };
}

function minimalValidate(out) {
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
  for (const k of reqTop) if (!(k in out)) throw new Error(`Missing top-level key: ${k}`);
  if (out.meta.version !== "signal_api_v1") throw new Error("meta.version must be signal_api_v1");
  if (!["structural", "web_fetch", "data_assisted"].includes(out.meta.mode)) throw new Error("meta.mode invalid");
  if (!Array.isArray(out.heatmap.regions) || out.heatmap.regions.length < 1) throw new Error("heatmap.regions empty");
}

function main() {
  const d = mustReadJson(IN_PATH);
  const runDate = todayISODate();

  const cpiHeadline = safeNum(d?.cpi?.headline);
  const delta3m = safeNum(d?.cpi?.delta_3m);
  const momentum = d?.cpi?.momentum || "Unknown";
  const brandedZone = mapZoneToBranded(d?.cpi?.zone);

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
  if ((stockOverlay || 0) > 0) { overlayTriggers.push(`stock_overlay_${stockOverlay}`); overlayPoints += stockOverlay; }
  if ((newsOverlay || 0) > 0) { overlayTriggers.push(`news_overlay_${newsOverlay}`); overlayPoints += newsOverlay; }
  if ((energyOverlay || 0) > 0) { overlayTriggers.push(`energy_overlay_${energyOverlay}`); overlayPoints += energyOverlay; }

  const riskDot = riskDotFromScore(cpiHeadline);

  const regimePrimary = d?.regime?.primary || "";
  const regimeModifier = d?.regime?.modifier || "";
  const regimeConfidence = d?.regime?.confidence || "medium";

  const thermoActive = Boolean(d?.risk_thermometer_mode || d?.cpi?.risk_thermometer_mode);
  const triggerReason = [];
  if (thermoActive) triggerReason.push("risk_thermometer_mode_active");
  if (Boolean(d?.cpi?.freeze_risk)) triggerReason.push("freeze_risk_true");
  if ((delta3m ?? 0) >= 8) triggerReason.push("delta_3m_accelerating");
  if ((capital ?? 0) >= 80) triggerReason.push("capital_override_band");

  const ep = d?.ecosystem_pulse || {};
  const ecosystem_pulse = {
    home_builders: ep?.builders?.state || "🟡",
    architects: ep?.architects?.state || "🟡",
    general_contractors: ep?.general_contractors?.state || "🟡",
    distributors: ep?.distributors?.state || "🟡",
    manufacturers: ep?.manufacturers?.state || "🟡"
  };

  const regionName = process.env.REGION_NAME || "National";
  const heatmapRow = {
    name: regionName,
    velocity: cpiArrow,
    pressure: riskDot,
    capital: riskDotFromScore(capital),
    residential: "🟡",
    institutional: "🟡",
    contractors: ecosystem_pulse.general_contractors,
    distribution: ecosystem_pulse.distributors,
    manufacturing: ecosystem_pulse.manufacturers
  };

  // ---- NEW: Ecosystem Power Index ----
  const ecosystem_power = computeEcosystemPower({
    cpi: cpiHeadline,
    delta3m,
    capital,
    pipeline,
    trade,
    overlays: {
      stock_overlay: stockOverlay,
      news_pressure_overlay: newsOverlay,
      energy_overlay: energyOverlay
    },
    dashboard: d
  });

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
        drivers: { capital, pipeline, trade, materials, regulatory, macro },
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
        risk_state: riskDotFromScore(capital),
        overlays: {
          active_triggers: overlayTriggers,
          overlay_points: Math.round(overlayPoints)
        }
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
        value: trade,
        risk_state: riskDotFromScore(trade),
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

    // Existing
    ecosystem_pulse,

    // NEW (non-breaking)
    ecosystem_power,

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
      notes: ["Built deterministically from dashboard_latest.json", "Includes Ecosystem Power Index (EPI) v1"]
    }
  };

  minimalValidate(out);
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2), "utf8");
  console.log(`Wrote ${OUT_PATH}`);
}

main();
