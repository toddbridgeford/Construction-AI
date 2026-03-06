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
import { handleConstructionMarketRadar, handleConstructionTerminal } from "./routes/construction.js";

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
