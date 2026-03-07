#!/usr/bin/env node
import { buildYtdPytdFromObservations } from "../src/routes/spending_ytd.js";
import worker from "../src/worker.js";
import { PORTFOLIO_LAYER_ENDPOINTS, __test_only__ as constructionTestOnly } from "../src/routes/construction.js";

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

  const radarWithNational = buildRadarFromMarkets([
    scoreMarketPayload({ meta: { region: { name: "United States" } }, indices: { pressure_index: { value: 80, zone: "Hot", momentum_band: "Accelerating", risk_state: "🔴" } }, regime: { cycle_state: "Expansion" } }, "United States"),
    scoreMarketPayload({ meta: { region: { name: "Austin" } }, indices: { pressure_index: { value: 61, zone: "Balanced", momentum_band: "Rising", risk_state: "🟡" } }, regime: { cycle_state: "Neutral" } }, "Austin"),
    scoreMarketPayload({ meta: { region: { name: "Dallas" } }, indices: { pressure_index: { value: 49, zone: "Balanced", momentum_band: "Stable", risk_state: "🟡" } }, regime: { cycle_state: "Neutral" } }, "Dallas"),
  ].filter(Boolean));

  assert(radarWithNational.hottest_markets[0].market !== "United States", "National should be excluded when metro entries exist");
  assert(radarWithNational.weakest_markets[0].market !== "United States", "National should be excluded from weakest when metro entries exist");
}


function runPowerHeatmapNowcastSmoke() {
  const { buildConstructionPowerFromMetrics, buildConstructionNowcastFromMetrics, toHeatmapPayload, buildForecastFromMarkets } = constructionTestOnly();

  const metrics = {
    liquidity_state: "tight",
    liquidity_score: 78,
    risk_score: 62,
    construction_index: 43,
    commercial_pct_change: -2.1,
    housing_pct_change: -1.3,
    mortgage_rate: 7.2,
  };

  const power = buildConstructionPowerFromMetrics(metrics);
  assert(typeof power.power_index.general_contractors.score === "number", "Power index GC score missing");
  assert(typeof power.power_index.lenders.state === "string", "Power index lender state missing");
  assert(typeof power.power_summary.margin_leader === "string", "Power summary margin_leader missing");

  const nowcast = buildConstructionNowcastFromMetrics(metrics, { permits_trend_pct: -1.4, starts_trend_pct: -0.8 });
  assert(["improving", "stable", "softening"].includes(nowcast.next_6_months), "Nowcast next_6_months invalid");
  assert(typeof nowcast.next_12_months_recession_probability === "number", "Nowcast recession probability missing");
  assert(Array.isArray(nowcast.drivers), "Nowcast drivers must be an array");

  const heatmap = toHeatmapPayload({
    hottest_markets: [{ market: "A", score: 60, regime: "Expansion", signal: "🟢", note: "x" }],
    weakest_markets: [{ market: "B", score: 40, regime: "Contraction", signal: "🔴", note: "y" }],
    summary: { top_strength_theme: "strength", top_weakness_theme: "weakness" },
  });
  assert(heatmap.ok === true, "Heatmap payload should be ok=true");
  assert(Array.isArray(heatmap.hottest_markets), "Heatmap hottest_markets missing");

  const forecast = buildForecastFromMarkets([
    { market: "Dallas", score: 72, regime: "expansion", signal: "bullish", note: "resilient demand and accelerating pipeline" },
    { market: "San Francisco", score: 43, regime: "contraction", signal: "bearish", note: "soft office demand with restrictive credit" },
    { market: "Phoenix", score: 66, regime: "late expansion", signal: "🟢", note: "strong migration backdrop" },
  ], {
    liquidity: { liquidity_state: "tight", liquidity_score: 72 },
    risk: { risk_score: 61 },
    construction_index: 47,
    spending: { ok: true, commercial: { pct_change_ytd_vs_pytd: -0.5 }, housing: { pct_change_ytd_vs_pytd: 0.3 } },
    nowcast: { next_6_months: "softening" },
    recession_probability: { next_12_months: 64 },
  });

  assert(Array.isArray(forecast.strongest_next_12_months), "Forecast strongest_next_12_months should be an array");
  assert(Array.isArray(forecast.weakest_next_12_months), "Forecast weakest_next_12_months should be an array");
  assert(typeof forecast.summary?.headline === "string", "Forecast summary headline missing");
}

function runIntelligenceLayerSmoke() {
  const { buildConstructionAlerts, buildRecessionProbability, buildStressIndex, buildEarlyWarning, buildCapitalFlows, buildMigrationIndex, buildMarketTape, buildBidIntensityModel, buildBacklogQualityModel, buildProjectRiskModel, buildMetroConcentrationRiskModel, buildCounterpartyConcentrationRiskModel, buildProjectMixExposureModel, buildPortfolioRiskModel } = constructionTestOnly();
  const terminal = {
    liquidity: { liquidity_state: "tight", liquidity_score: 62, mortgage_rate: 7.1 },
    risk: { risk_score: 58, risk_level: "elevated" },
    construction_index: 43,
    spending: {
      ok: true,
      commercial: { pct_change_ytd_vs_pytd: -2.5 },
      housing: { pct_change_ytd_vs_pytd: -1.2 },
    },
  };

  const alerts = buildConstructionAlerts(terminal);
  const codes = alerts.map((a) => a.code);
  assert(codes.includes("LIQUIDITY_TIGHTENING"), "Alerts should include liquidity tightening");
  assert(codes.includes("ELEVATED_RISK"), "Alerts should include elevated risk");
  assert(codes.includes("COMMERCIAL_WEAKNESS"), "Alerts should include commercial weakness");
  assert(codes.includes("HOUSING_WEAKNESS"), "Alerts should include housing weakness");
  assert(codes.includes("BROAD_SLOWDOWN"), "Alerts should include broad slowdown");
  assert(codes.includes("CONSTRUCTION_CONTRACTION_RISK"), "Alerts should include contraction risk");

  const recession = buildRecessionProbability(terminal);
  assert(recession.next_12_months === 100, "Recession probability should deterministically score to 100 after clamping");
  assert(recession.trend === "rising", "Recession trend should be rising for high probability");
  assert(typeof recession.explanation === "string" && recession.explanation.length > 0, "Recession explanation missing");

  const stress = buildStressIndex({ ...terminal, nowcast: { next_6_months: "softening" } });
  assert(typeof stress.score === "number", "Stress score missing");
  assert(typeof stress.state === "string", "Stress state missing");
  assert(Array.isArray(stress.drivers), "Stress drivers should be an array");

  const earlyWarning = buildEarlyWarning({
    nowcast: { next_6_months: "softening" },
    recession_probability: { next_12_months: 62 },
    stress_index: stress,
  });
  assert(typeof earlyWarning.state === "string", "Early warning state missing");
  assert(typeof earlyWarning.score === "number", "Early warning score missing");
  assert(Array.isArray(earlyWarning.drivers), "Early warning drivers should be an array");

  const capitalFlows = buildCapitalFlows({
    ...terminal,
    power_index: { lenders: { score: 66 } },
  });
  assert(typeof capitalFlows.lending_growth === "string", "Capital flows lending_growth missing");
  assert(typeof capitalFlows.headline === "string", "Capital flows headline missing");

  const migrationIndex = buildMigrationIndex(
    { hottest_markets: [{ market: "Dallas", score: 74 }], weakest_markets: [{ market: "Seattle", score: 41 }] },
    {
      strongest_next_12_months: [{ market: "Austin", forecast_score: 78 }],
      weakest_next_12_months: [{ market: "Boston", forecast_score: 39 }],
    },
  );
  assert(Array.isArray(migrationIndex.inbound_markets), "Migration inbound markets missing");
  assert(Array.isArray(migrationIndex.outbound_markets), "Migration outbound markets missing");
  assert(typeof migrationIndex.inbound_markets[0]?.explanation === "string", "Migration inbound explanation missing");
  assert(typeof migrationIndex.outbound_markets[0]?.explanation === "string", "Migration outbound explanation missing");
  assert(typeof migrationIndex.headline === "string", "Migration headline missing");

  const marketTape = buildMarketTape({
    ...terminal,
    signal: { signal: "🟡 Neutral" },
    regime: { regime: "Late Cycle" },
    risk: { risk_level: "elevated", risk_score: 58 },
    stress_index: stress,
    recession_probability: recession,
    migration_index: migrationIndex,
    forecast_summary: { strongest_market: "Austin", weakest_market: "Boston" },
  });
  assert(typeof marketTape.risk === "string", "Market tape risk should be a string");

  const enrichedTerminal = {
    ...terminal,
    activity_trends: { permits_trend_pct: 1.6, starts_trend_pct: 2.1 },
    power_index: {
      general_contractors: { score: 58 },
      subcontractors: { score: 62 },
      developers: { score: 55 },
    },
    migration_index: {
      inbound_markets: [{ market: "Austin", score: 68 }],
      outbound_markets: [{ market: "Seattle", score: 42 }],
    },
    stress_index: stress,
    early_warning: earlyWarning,
    recession_probability: recession,
    labor_shock: { score: 67, state: "elevated", drivers: [], explanation: "test" },
    margin_pressure: { score: 71, state: "elevated", drivers: [], explanation: "test" },
  };

  const backlogQuality = buildBacklogQualityModel(enrichedTerminal);
  assert(typeof backlogQuality.score === "number", "Backlog quality score missing");
  assert(["low", "moderate", "elevated", "severe", "weak", "mixed", "strong"].includes(backlogQuality.state), "Backlog quality state invalid");

  const bidIntensity = buildBidIntensityModel({ ...enrichedTerminal, backlog_quality: backlogQuality });
  assert(typeof bidIntensity.score === "number", "Bid intensity score missing");
  assert(["low", "moderate", "elevated", "severe"].includes(bidIntensity.state), "Bid intensity state invalid");

  const projectRisk = buildProjectRiskModel({ ...enrichedTerminal, backlog_quality: backlogQuality });
  assert(typeof projectRisk.score === "number", "Project risk score missing");
  assert(["low", "moderate", "elevated", "severe"].includes(projectRisk.state), "Project risk state invalid");

  const metroConcentrationRisk = buildMetroConcentrationRiskModel({
    ...enrichedTerminal,
    forecast: {
      strongest_next_12_months: [{ market: "Austin", forecast_score: 79 }],
      weakest_next_12_months: [{ market: "Seattle", forecast_score: 40 }],
    },
  });
  assert(typeof metroConcentrationRisk.score === "number", "Metro concentration risk score missing");
  assert(["low", "moderate", "elevated", "severe"].includes(metroConcentrationRisk.state), "Metro concentration risk state invalid");

  const counterpartyConcentrationRisk = buildCounterpartyConcentrationRiskModel({
    ...enrichedTerminal,
    owner_risk: { score: 66, state: "elevated", drivers: [], explanation: "test" },
    developer_fragility: { score: 64, state: "elevated", drivers: [], explanation: "test" },
    lender_pullback_risk: { score: 62, state: "elevated", drivers: [], explanation: "test" },
    counterparty_quality: { score: 39, state: "weak", drivers: [], explanation: "test" },
    receivables_risk: { score: 63, state: "elevated", drivers: [], explanation: "test" },
    collections_stress: { score: 65, state: "elevated", drivers: [], explanation: "test" },
  });
  assert(typeof counterpartyConcentrationRisk.score === "number", "Counterparty concentration risk score missing");
  assert(["low", "moderate", "elevated", "severe"].includes(counterpartyConcentrationRisk.state), "Counterparty concentration risk state invalid");

  const projectMixExposure = buildProjectMixExposureModel({ ...enrichedTerminal, project_risk: projectRisk });
  assert(typeof projectMixExposure.score === "number", "Project mix exposure score missing");
  assert(["low", "moderate", "elevated", "severe"].includes(projectMixExposure.state), "Project mix exposure state invalid");

  const portfolioRisk = buildPortfolioRiskModel({
    ...enrichedTerminal,
    metro_concentration_risk: metroConcentrationRisk,
    counterparty_concentration_risk: counterpartyConcentrationRisk,
    project_mix_exposure: projectMixExposure,
    collections_stress: { score: 65, state: "elevated", drivers: [], explanation: "test" },
    margin_pressure: { score: 71, state: "elevated", drivers: [], explanation: "test" },
    project_risk: projectRisk,
  });
  assert(typeof portfolioRisk.score === "number", "Portfolio risk score missing");
  assert(["low", "moderate", "elevated", "severe"].includes(portfolioRisk.state), "Portfolio risk state invalid");
}


async function runPortfolioRouteWiringSmoke() {
  for (const path of PORTFOLIO_LAYER_ENDPOINTS) {
    const response = await worker.fetch(new Request(`https://example.com${path}`), {});
    assert(response.status !== 404, `${path} must be registered in worker route table`);

    const bodyText = await response.text();
    let parsed;
    try {
      parsed = JSON.parse(bodyText);
    } catch (err) {
      throw new Error(`${path} must return valid JSON: ${err?.message || String(err)}`);
    }

    assert(parsed && typeof parsed === "object", `${path} must return a JSON object`);
  }
}

(async () => {
  try {
    runYtdSmoke();
    runTerminalSmoke();
    runMarketRadarSmoke();
    runIntelligenceLayerSmoke();
    runPowerHeatmapNowcastSmoke();
    await runPortfolioRouteWiringSmoke();
    console.log("smoke_worker_node: PASS");
  } catch (err) {
    console.error("smoke_worker_node: FAIL");
    console.error(err?.stack || String(err));
    process.exit(1);
  }
})();
