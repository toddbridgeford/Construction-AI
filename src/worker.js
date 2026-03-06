import { CORS_HEADERS, error } from "./lib/http.js";
import {
  handleBundle,
  handleConstructionIndex,
  handleCpi,
  handleFredObservations,
  handleHealth,
  handleLiquidity,
  handleNotionSeries,
  handleRegime,
  handleRiskScore,
  handleScheduled,
  handleSignal,
  handleConstructionDashboard,
} from "./routes/existing.js";
import { handleSpendingYtd, handleSpendingYtdSummary, handleYtdSegment, handleYtdSummary } from "./routes/spending_ytd.js";
import {
  handleConstructionAlerts,
  handleConstructionMarketRadar,
  handleConstructionMorningBrief,
  handleConstructionRecessionProbability,
  handleConstructionTerminal,
  handleConstructionPower,
  handleConstructionHeatmap,
  handleConstructionNowcast,
  handleConstructionForecast,
  handleConstructionStressIndex,
  handleConstructionEarlyWarning,
  handleConstructionCapitalFlows,
  handleConstructionMigrationIndex,
  handleConstructionMaterialsShock,
  handleConstructionLaborShock,
  handleConstructionMarginPressure,
  handleConstructionBidIntensity,
  handleConstructionBacklogQuality,
  handleConstructionProjectRisk,
  handleConstructionReceivablesRisk,
  handleConstructionPaymentDelayRisk,
  handleConstructionCollectionsStress,
} from "./routes/construction.js";

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const { pathname } = new URL(request.url);

    try {
      if (request.method !== "GET") return error(env, 405, "METHOD_NOT_ALLOWED", "Method not allowed");

      if (pathname === "/" || pathname === "/health") return handleHealth(env);
      if (pathname === "/fred/observations") return handleFredObservations(request, env);
      if (pathname === "/cpi") return handleCpi(env);
      if (pathname === "/notion/series") return handleNotionSeries(env);

      if (pathname === "/bundle") return handleBundle(request, env);
      if (pathname === "/signal") return handleSignal(env);
      if (pathname === "/regime") return handleRegime(env);
      if (pathname === "/liquidity") return handleLiquidity(env);
      if (pathname === "/construction-index") return handleConstructionIndex(env);
      if (pathname === "/risk-score") return handleRiskScore(env);

      if (pathname === "/construction/dashboard") return handleConstructionDashboard(env);
      if (pathname === "/construction/terminal") return handleConstructionTerminal(request, env);
      if (pathname === "/construction/market-radar") return handleConstructionMarketRadar(env);
      if (pathname === "/construction/power") return handleConstructionPower(request, env);
      if (pathname === "/construction/heatmap") return handleConstructionHeatmap(env);
      if (pathname === "/construction/nowcast") return handleConstructionNowcast(request, env);
      if (pathname === "/construction/forecast") return handleConstructionForecast(request, env);
      if (pathname === "/construction/stress-index") return handleConstructionStressIndex(request, env);
      if (pathname === "/construction/early-warning") return handleConstructionEarlyWarning(request, env);
      if (pathname === "/construction/capital-flows") return handleConstructionCapitalFlows(request, env);
      if (pathname === "/construction/migration-index") return handleConstructionMigrationIndex(request, env);
      if (pathname === "/construction/materials-shock") return handleConstructionMaterialsShock(request, env);
      if (pathname === "/construction/labor-shock") return handleConstructionLaborShock(request, env);
      if (pathname === "/construction/margin-pressure") return handleConstructionMarginPressure(request, env);
      if (pathname === "/construction/bid-intensity") return handleConstructionBidIntensity(request, env);
      if (pathname === "/construction/backlog-quality") return handleConstructionBacklogQuality(request, env);
      if (pathname === "/construction/project-risk") return handleConstructionProjectRisk(request, env);
      if (pathname === "/construction/receivables-risk") return handleConstructionReceivablesRisk(request, env);
      if (pathname === "/construction/payment-delay-risk") return handleConstructionPaymentDelayRisk(request, env);
      if (pathname === "/construction/collections-stress") return handleConstructionCollectionsStress(request, env);
      if (pathname === "/construction/morning-brief") return handleConstructionMorningBrief(request, env);
      if (pathname === "/construction/alerts") return handleConstructionAlerts(request, env);
      if (pathname === "/construction/recession-probability") return handleConstructionRecessionProbability(request, env);

      if (pathname === "/spending/ytd") return handleSpendingYtd(request, env);
      if (pathname === "/spending/ytd/summary") return handleSpendingYtdSummary(request, env);

      if (pathname === "/ytd/commercial") return handleYtdSegment(request, env, "commercial");
      if (pathname === "/ytd/housing") return handleYtdSegment(request, env, "housing");
      if (pathname === "/ytd/summary") return handleYtdSummary(request, env);

      return error(env, 404, "NOT_FOUND", "Not found", { path: pathname });
    } catch (e) {
      return error(env, 500, "UNHANDLED", "Unhandled exception", { message: e?.message || String(e) });
    }
  },

  async scheduled(_event, env) {
    await handleScheduled(env);
  },
};
