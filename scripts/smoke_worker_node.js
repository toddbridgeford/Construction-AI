#!/usr/bin/env node
import { buildYtdPytdFromObservations } from "../src/routes/spending_ytd.js";
import { __test_only__ as constructionTestOnly } from "../src/routes/construction.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function approx(actual, expected, msg) {
  if (Math.abs(actual - expected) > 1e-12) {
    throw new Error(`${msg}: expected=${expected} actual=${actual}`);
  }
}

function runYtdSmoke() {
  const synthetic = [
    { date: "2025-03-01", value: "132000000" },
    { date: "2025-02-01", value: "120000000" },
    { date: "2025-01-01", value: "120000000" },
    { date: "2024-12-01", value: "120000000" },
    { date: "2024-11-01", value: "120000000" },
    { date: "2024-10-01", value: "120000000" },
    { date: "2024-09-01", value: "120000000" },
    { date: "2024-08-01", value: "120000000" },
    { date: "2024-07-01", value: "120000000" },
    { date: "2024-06-01", value: "120000000" },
    { date: "2024-05-01", value: "120000000" },
    { date: "2024-04-01", value: "120000000" },
    { date: "2024-03-01", value: "114000000" },
    { date: "2024-02-01", value: "108000000" },
    { date: "2024-01-01", value: "96000000" },
    { date: "2023-03-01", value: "100000000" },
    { date: "2023-02-01", value: "100000000" },
    { date: "2023-01-01", value: "100000000" },
  ];

  const defaultYear = buildYtdPytdFromObservations(synthetic);
  assert(defaultYear.year === 2024, "Expected default year to use latest complete year");

  const result = buildYtdPytdFromObservations(synthetic, 2025);
  assert(result.year === 2025, "Expected target year 2025");
  assert(result.months_included.length === 3, "Expected Jan..Mar months included");
  approx(result.ytd_monthly_equiv_musd, 31, "Unexpected YTD MUSD total");
  approx(result.pytd_monthly_equiv_musd, 26.5, "Unexpected PYTD MUSD total");
}

function runTerminalSmoke() {
  const { cycleInterpretation } = constructionTestOnly();
  assert(cycleInterpretation(62, "neutral", 40) === "Expansion", "Terminal cycle should classify expansion");
  assert(cycleInterpretation(51, "tight", 40) === "Late Cycle", "Terminal cycle should classify late cycle");
  assert(cycleInterpretation(44, "tight", 60) === "Contraction", "Terminal cycle should classify contraction first");
  assert(cycleInterpretation(49, "easy", 55) === "Slowdown", "Terminal cycle should classify slowdown");
  assert(cycleInterpretation(52, "neutral", 30) === "Neutral", "Terminal cycle should classify neutral");
}

function runMarketRadarSmoke() {
  const { scoreMarketPayload, buildRadarFromMarkets } = constructionTestOnly();
  const payloads = [
    {
      meta: { region: { name: "Market A" } },
      indices: { pressure_index: { value: 70, zone: "Hot", momentum_band: "Accelerating", risk_state: "🔴" } },
      regime: { cycle_state: "Late Cycle" },
    },
    {
      meta: { region: { name: "Market B" } },
      indices: { pressure_index: { value: 45, zone: "Compression", momentum_band: "Stable", risk_state: "🟢" } },
      regime: { cycle_state: "Neutral" },
    },
    {
      meta: { region: { name: "Market C" } },
      indices: { pressure_index: { value: 55, zone: "Balanced", momentum_band: "Rising", risk_state: "🟡" } },
      regime: { cycle_state: "Expansion" },
    },
  ];

  const scored = payloads.map((p, i) => scoreMarketPayload(p, `Fallback ${i + 1}`)).filter(Boolean);
  const radar = buildRadarFromMarkets(scored);

  assert(Array.isArray(radar.hottest_markets), "Radar hottest_markets should be an array");
  assert(Array.isArray(radar.weakest_markets), "Radar weakest_markets should be an array");
  assert(typeof radar.summary?.top_strength_theme === "string", "Radar summary top_strength_theme missing");
  assert(typeof radar.summary?.top_weakness_theme === "string", "Radar summary top_weakness_theme missing");
  assert(radar.hottest_markets[0].market === "Market A", "Highest pressure market should rank first");
  assert(radar.weakest_markets[0].market === "Market B", "Lowest pressure market should rank first among weakest");
}

try {
  runYtdSmoke();
  runTerminalSmoke();
  runMarketRadarSmoke();
  console.log("smoke_worker_node: PASS");
} catch (err) {
  console.error("smoke_worker_node: FAIL");
  console.error(err?.stack || String(err));
  process.exit(1);
}
