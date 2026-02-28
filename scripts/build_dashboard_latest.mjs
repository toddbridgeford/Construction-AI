// ==========================================================
// Capital OS v6 — Institutional Flow Monitor
// Clean deterministic build script
// ==========================================================

import fs from "fs";

// ----------------------------
// Helpers
// ----------------------------

function safeNumber(x, fallback = 0) {
  if (x === null || x === undefined || isNaN(Number(x))) return fallback;
  return Number(x);
}

function pctChange(current, previous) {
  if (!previous || previous === 0) return 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// ----------------------------
// Load Inputs
// ----------------------------

const fred = JSON.parse(fs.readFileSync("./config/fred_signals.json", "utf8"));
const msaPermits = JSON.parse(fs.readFileSync("./config/msa_permits.json", "utf8"));
const statePermits = JSON.parse(fs.readFileSync("./config/state_permits.json", "utf8"));

// ----------------------------
// Core Signals
// ----------------------------

const cpi = safeNumber(fred.cpi);
const ceps = safeNumber(fred.ceps);
const vix = safeNumber(fred.vix);
const us10y = safeNumber(fred.us10y_chg_bps);
const bmi = safeNumber(fred.builders_index);

// ----------------------------
// Institutional Flow Monitor
// ----------------------------

// Permit velocity (latest vs 30d prior)
const stateVelocity = pctChange(
  safeNumber(statePermits.current),
  safeNumber(statePermits.prior_30d)
);

const msaVelocity = pctChange(
  safeNumber(msaPermits.current),
  safeNumber(msaPermits.prior_30d)
);

// Lending proxy (rate sensitivity model)
const lendingPressure = clamp((us10y / 100) * 10, -20, 20);

// Divergence: institutional vs residential
const instVsRes = clamp(stateVelocity - msaVelocity, -30, 30);

// Flow Pressure Index (FPI)
const fpi =
  0.4 * stateVelocity +
  0.3 * msaVelocity +
  0.2 * lendingPressure +
  0.1 * instVsRes;

// Flow Severity
let flowSeverity = "STABLE";
if (fpi > 15) flowSeverity = "EXPANSION";
if (fpi < -15) flowSeverity = "CONTRACTION";

// ----------------------------
// Updated Regime Weighting
// ----------------------------

let tighteningProb = clamp(
  0.5 +
    (cpi - 50) / 100 +
    vix / 100 +
    lendingPressure / 50,
  0,
  1
);

let easingProb = clamp(
  0.5 -
    (cpi - 50) / 100 -
    lendingPressure / 50,
  0,
  1
);

let neutralProb = clamp(1 - tighteningProb - easingProb, 0, 1);

// Normalize
const total = tighteningProb + easingProb + neutralProb;

tighteningProb /= total;
easingProb /= total;
neutralProb /= total;

// ----------------------------
// Allocation Signal (Phase B Hook)
// ----------------------------

let allocationBias = "NEUTRAL";
if (tighteningProb > 0.6) allocationBias = "DEFENSIVE";
if (easingProb > 0.6) allocationBias = "OVERWEIGHT";

// ----------------------------
// Output JSON
// ----------------------------

const output = {
  schema_version: "6.0",
  asof: new Date().toISOString().split("T")[0],

  ceps_score: ceps,
  capital: {
    pressure_index: cpi
  },

  institutional_flow_monitor: {
    state_velocity: Number(stateVelocity.toFixed(2)),
    msa_velocity: Number(msaVelocity.toFixed(2)),
    lending_pressure: Number(lendingPressure.toFixed(2)),
    divergence: Number(instVsRes.toFixed(2)),
    flow_pressure_index: Number(fpi.toFixed(2)),
    severity: flowSeverity
  },

  regime_probability_matrix: {
    probabilities: {
      TIGHTENING: Number(tighteningProb.toFixed(2)),
      NEUTRAL: Number(neutralProb.toFixed(2)),
      EASING: Number(easingProb.toFixed(2))
    },
    implied:
      tighteningProb > easingProb && tighteningProb > neutralProb
        ? "TIGHTENING"
        : easingProb > tighteningProb && easingProb > neutralProb
        ? "EASING"
        : "NEUTRAL"
  },

  capital_allocation_engine: {
    bias: allocationBias
  }
};

fs.writeFileSync("dashboard_latest.json", JSON.stringify(output, null, 2));
console.log("Capital OS v6 build complete.");
