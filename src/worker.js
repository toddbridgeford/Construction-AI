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
  handleConstructionScenarios,
  handleConstructionWatchlist,
  handleConstructionMorningBriefV2,
  handleConstructionSettings,
  handleConstructionSettingsDefaults,
  handleConstructionSettingsReset,
  handleConstructionSettingsProfiles,
  handleConstructionSettingsActiveProfile,
  handleConstructionSettingsProfilesCreate,
  handleConstructionSettingsProfilesActivate,
  handleConstructionSettingsProfilesDelete,
  handleConstructionCustomWatchlist,
  PORTFOLIO_LAYER_ROUTE_HANDLERS,
} from "./routes/construction.js";

export const CONSTRUCTION_ROUTE_HANDLERS = {
  "/construction/dashboard": (request, env) => handleConstructionDashboard(env),
  "/construction/terminal": handleConstructionTerminal,
  "/construction/market-radar": (_request, env) => handleConstructionMarketRadar(env),
  "/construction/power": handleConstructionPower,
  "/construction/heatmap": (_request, env) => handleConstructionHeatmap(env),
  "/construction/nowcast": handleConstructionNowcast,
  "/construction/forecast": handleConstructionForecast,
  "/construction/stress-index": handleConstructionStressIndex,
  "/construction/early-warning": handleConstructionEarlyWarning,
  "/construction/capital-flows": handleConstructionCapitalFlows,
  "/construction/migration-index": handleConstructionMigrationIndex,
  "/construction/materials-shock": handleConstructionMaterialsShock,
  "/construction/labor-shock": handleConstructionLaborShock,
  "/construction/margin-pressure": handleConstructionMarginPressure,
  "/construction/bid-intensity": handleConstructionBidIntensity,
  "/construction/backlog-quality": handleConstructionBacklogQuality,
  "/construction/project-risk": handleConstructionProjectRisk,
  "/construction/receivables-risk": handleConstructionReceivablesRisk,
  "/construction/payment-delay-risk": handleConstructionPaymentDelayRisk,
  "/construction/collections-stress": handleConstructionCollectionsStress,
  "/construction/scenarios": handleConstructionScenarios,
  "/construction/watchlist": handleConstructionWatchlist,
  "/construction/watchlist/custom": handleConstructionCustomWatchlist,
  "/construction/settings": handleConstructionSettings,
  "/construction/settings/defaults": handleConstructionSettingsDefaults,
  "/construction/settings/reset": handleConstructionSettingsReset,
  "/construction/settings/profiles": (request, env) => request.method === "GET"
    ? handleConstructionSettingsProfiles(request, env)
    : handleConstructionSettingsProfilesCreate(request, env),
  "/construction/settings/active-profile": handleConstructionSettingsActiveProfile,
  "/construction/settings/profiles/activate": handleConstructionSettingsProfilesActivate,
  "/construction/settings/profiles/delete": handleConstructionSettingsProfilesDelete,
  "/construction/morning-brief/v2": handleConstructionMorningBriefV2,
  ...PORTFOLIO_LAYER_ROUTE_HANDLERS,
};

export default {
  async fetch(request, env) {
    const isHeadRequest = request.method === "HEAD";
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const { pathname } = new URL(request.url);

    try {
      const isSettingsWriteRoute = [
        "/construction/settings",
        "/construction/settings/reset",
        "/construction/settings/profiles",
        "/construction/settings/active-profile",
        "/construction/settings/profiles/activate",
        "/construction/settings/profiles/delete",
      ].includes(pathname);
      if (!(["GET", "POST", "HEAD"].includes(request.method))) return error(env, 405, "METHOD_NOT_ALLOWED", "Method not allowed");
      if (request.method === "POST" && !isSettingsWriteRoute) return error(env, 405, "METHOD_NOT_ALLOWED", "Method not allowed");

      const dispatchRequest = isHeadRequest
        ? new Request(request.url, { method: "GET", headers: request.headers })
        : request;
      const finalizeResponse = (response) => isHeadRequest
        ? new Response(null, { status: response.status, headers: response.headers })
        : response;

      if (pathname === "/" || pathname === "/health") return finalizeResponse(await handleHealth(env));
      if (pathname === "/fred/observations") return finalizeResponse(await handleFredObservations(dispatchRequest, env));
      if (pathname === "/cpi") return finalizeResponse(await handleCpi(env));
      if (pathname === "/notion/series") return finalizeResponse(await handleNotionSeries(env));

      if (pathname === "/bundle") return finalizeResponse(await handleBundle(dispatchRequest, env));
      if (pathname === "/signal") return finalizeResponse(await handleSignal(env));
      if (pathname === "/regime") return finalizeResponse(await handleRegime(env));
      if (pathname === "/liquidity") return finalizeResponse(await handleLiquidity(env));
      if (pathname === "/construction-index") return finalizeResponse(await handleConstructionIndex(env));
      if (pathname === "/risk-score") return finalizeResponse(await handleRiskScore(env));

      const constructionRouteHandler = CONSTRUCTION_ROUTE_HANDLERS[pathname];
      if (constructionRouteHandler) return finalizeResponse(await constructionRouteHandler(dispatchRequest, env));
      if (pathname === "/construction/morning-brief") return finalizeResponse(await handleConstructionMorningBrief(dispatchRequest, env));
      if (pathname === "/construction/alerts") return finalizeResponse(await handleConstructionAlerts(dispatchRequest, env));
      if (pathname === "/construction/recession-probability") return finalizeResponse(await handleConstructionRecessionProbability(dispatchRequest, env));

      if (pathname === "/spending/ytd") return finalizeResponse(await handleSpendingYtd(dispatchRequest, env));
      if (pathname === "/spending/ytd/summary") return finalizeResponse(await handleSpendingYtdSummary(dispatchRequest, env));

      if (pathname === "/ytd/commercial") return finalizeResponse(await handleYtdSegment(dispatchRequest, env, "commercial"));
      if (pathname === "/ytd/housing") return finalizeResponse(await handleYtdSegment(dispatchRequest, env, "housing"));
      if (pathname === "/ytd/summary") return finalizeResponse(await handleYtdSummary(dispatchRequest, env));

      return finalizeResponse(error(env, 404, "NOT_FOUND", "Not found", { path: pathname }));
    } catch (e) {
      return error(env, 500, "UNHANDLED", "Unhandled exception", { message: e?.message || String(e) });
    }
  },

  async scheduled(_event, env) {
    await handleScheduled(env);
  },
};
