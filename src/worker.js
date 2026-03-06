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
} from "./routes/existing.js";
import { handleSpendingYtd, handleSpendingYtdSummary } from "./routes/spending_ytd.js";

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

      if (pathname === "/spending/ytd") return handleSpendingYtd(request, env);
      if (pathname === "/spending/ytd/summary") return handleSpendingYtdSummary(request, env);

      return error(env, 404, "NOT_FOUND", "Not found", { path: pathname });
    } catch (e) {
      return error(env, 500, "UNHANDLED", "Unhandled exception", { message: e?.message || String(e) });
    }
  },

  async scheduled(_event, env) {
    await handleScheduled(env);
  },
};
