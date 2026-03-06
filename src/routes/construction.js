import { error, ok } from "../lib/http.js";
import { buildConstructionDashboard } from "./existing.js";
import { handleSpendingYtdSummary } from "./spending_ytd.js";

function subsectionError(code, message, details = null) {
  return {
    ok: false,
    error: {
      code,
      message,
      ...(details === null ? {} : { details }),
    },
  };
}

function safeJsonResponseBody(response) {
  if (!(response instanceof Response)) return null;
  return response
    .clone()
    .json()
    .catch(() => null);
}

function cycleInterpretation(constructionIndex, liquidityState, riskScore) {
  if (constructionIndex !== null && constructionIndex >= 60 && liquidityState !== "tight") return "Expansion";
  if (constructionIndex !== null && constructionIndex >= 50 && liquidityState === "tight") return "Late Cycle";
  if (constructionIndex !== null && constructionIndex < 45 && liquidityState === "tight") return "Contraction";
  if (constructionIndex !== null && constructionIndex < 50 && riskScore !== null && riskScore >= 55) return "Slowdown";
  return "Neutral";
}

function operatorActions() {
  return {
    gc: "Protect backlog quality and tighten buyout terms.",
    subcontractor: "Maintain pricing discipline while capacity remains tight.",
    developer: "Slow speculative starts until financing spreads stabilize.",
    lender: "Monitor commercial exposure and tightening credit conditions.",
  };
}

async function readSpendingSummary(request, env) {
  const spendingResponse = await handleSpendingYtdSummary(request, env);
  if (!(spendingResponse instanceof Response)) {
    return subsectionError("INTERNAL", "Unexpected spending summary response type");
  }

  if (spendingResponse.status >= 400) {
    const payload = await safeJsonResponseBody(spendingResponse);
    return subsectionError(
      payload?.error?.code || "SPENDING_SUMMARY_FAILED",
      payload?.error?.message || "Unable to compute spending summary",
      payload?.error?.details || { status: spendingResponse.status }
    );
  }

  const payload = await safeJsonResponseBody(spendingResponse);
  const commercial = payload?.summary?.commercial;
  const housing = payload?.summary?.housing;

  if (!commercial || !housing) {
    return subsectionError("SPENDING_SUMMARY_INVALID", "Spending summary payload missing commercial/housing segments");
  }

  return {
    ok: true,
    commercial,
    housing,
  };
}

function toRadarMarketEntry(market) {
  return {
    market: market.market,
    score: market.score,
    regime: market.regime,
    signal: market.signal,
    note: market.note,
  };
}

function summarizeTheme(markets, direction) {
  const zones = markets.map((m) => m.zone).filter((z) => typeof z === "string" && z.length > 0);
  const momentum = markets.map((m) => m.momentumBand).filter((m) => typeof m === "string" && m.length > 0);
  const zonePart = zones.length > 0 ? `zone=${zones[0]}` : "zone=unknown";
  const momentumPart = momentum.length > 0 ? `momentum=${momentum[0]}` : "momentum=unknown";
  return `${direction}: ${zonePart}, ${momentumPart}`;
}

function scoreMarketPayload(payload, fallbackMarketName) {
  const market = payload?.meta?.region?.name || fallbackMarketName;
  const score = payload?.indices?.pressure_index?.value;
  if (!Number.isFinite(score)) return null;

  const cycleState = payload?.regime?.cycle_state;
  const zone = payload?.indices?.pressure_index?.zone;
  const momentumBand = payload?.indices?.pressure_index?.momentum_band;
  const signal = payload?.indices?.pressure_index?.risk_state;

  // Deterministic ranking strategy:
  // 1) Primary sort by pressure_index.value descending (higher = hotter pressure).
  // 2) Tiebreak by market name ascending for stable output.
  return {
    market,
    score,
    regime: typeof cycleState === "string" && cycleState.length > 0 ? cycleState : "unknown",
    signal: typeof signal === "string" && signal.length > 0 ? signal : "unknown",
    zone: typeof zone === "string" && zone.length > 0 ? zone : null,
    momentumBand: typeof momentumBand === "string" && momentumBand.length > 0 ? momentumBand : null,
    note: `pressure_index=${score}; zone=${zone || "unknown"}; momentum=${momentumBand || "unknown"}`,
  };
}


function buildRadarFromMarkets(scoredMarkets) {
  if (!Array.isArray(scoredMarkets) || scoredMarkets.length === 0) {
    return subsectionError(
      "MARKETS_DATA_UNUSABLE",
      "No market signal files contained a numeric indices.pressure_index.value for deterministic ranking"
    );
  }

  const rankedDesc = [...scoredMarkets].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.market.localeCompare(b.market);
  });

  const rankedAsc = [...rankedDesc].reverse();
  const topCount = Math.min(3, rankedDesc.length);

  return {
    hottest_markets: rankedDesc.slice(0, topCount).map(toRadarMarketEntry),
    weakest_markets: rankedAsc.slice(0, topCount).map(toRadarMarketEntry),
    summary: {
      top_strength_theme: summarizeTheme(rankedDesc.slice(0, topCount), "strength"),
      top_weakness_theme: summarizeTheme(rankedAsc.slice(0, topCount), "weakness"),
    },
  };
}

export async function handleConstructionTerminal(request, env) {
  try {
    const dashboardResult = await buildConstructionDashboard(env);
    const spending = await readSpendingSummary(request, env);

    const terminal = {
      signal: dashboardResult.failed ? subsectionError("DASHBOARD_FAILED", "Unable to compute dashboard", { status: 500 }) : dashboardResult.data.signal,
      regime: dashboardResult.failed ? subsectionError("DASHBOARD_FAILED", "Unable to compute dashboard", { status: 500 }) : dashboardResult.data.regime,
      liquidity: dashboardResult.failed ? subsectionError("DASHBOARD_FAILED", "Unable to compute dashboard", { status: 500 }) : dashboardResult.data.liquidity,
      risk: dashboardResult.failed ? subsectionError("DASHBOARD_FAILED", "Unable to compute dashboard", { status: 500 }) : dashboardResult.data.risk,
      construction_index: dashboardResult.failed ? subsectionError("DASHBOARD_FAILED", "Unable to compute dashboard", { status: 500 }) : dashboardResult.data.construction_index,
      spending,
      cycle_interpretation: "Neutral",
      operator_actions: operatorActions(),
    };

    if (!dashboardResult.failed) {
      terminal.cycle_interpretation = cycleInterpretation(
        dashboardResult.data.construction_index,
        dashboardResult.data.liquidity?.liquidity_state || null,
        dashboardResult.data.risk?.risk_score ?? null
      );
    } else {
      const dashboardPayload = await safeJsonResponseBody(dashboardResult.response);
      const dashboardError = subsectionError(
        dashboardPayload?.error?.code || "DASHBOARD_FAILED",
        dashboardPayload?.error?.message || "Unable to compute dashboard",
        dashboardPayload?.error?.details || null
      );
      terminal.signal = dashboardError;
      terminal.regime = dashboardError;
      terminal.liquidity = dashboardError;
      terminal.risk = dashboardError;
      terminal.construction_index = dashboardError;
      terminal.cycle_interpretation = "Neutral";
    }

    return ok(env, { terminal });
  } catch (e) {
    return error(env, 500, "TERMINAL_FAILED", "Unable to build construction terminal", {
      message: e?.message || String(e),
    });
  }
}

export async function handleConstructionMarketRadar(env) {
  try {
    if (!env.ASSETS || typeof env.ASSETS.fetch !== "function") {
      return ok(env, {
        radar: subsectionError("ASSETS_NOT_CONFIGURED", "Static asset binding is not configured; cannot read dist/markets/*.json files"),
      });
    }

    const base = "http://assets";
    const marketsIndexRes = await env.ASSETS.fetch(`${base}/dist/markets/index.json`);

    if (!marketsIndexRes.ok) {
      return ok(env, {
        radar: subsectionError("MARKETS_INDEX_MISSING", "Unable to read dist/markets/index.json", { status: marketsIndexRes.status }),
      });
    }

    const marketsIndex = await marketsIndexRes.json();
    const entries = Array.isArray(marketsIndex?.markets) ? marketsIndex.markets : [];
    if (entries.length === 0) {
      return ok(env, { radar: subsectionError("MARKETS_INDEX_EMPTY", "No market entries found in dist/markets/index.json") });
    }

    const scoredMarkets = [];
    for (const entry of entries) {
      const marketPath = entry?.path;
      if (typeof marketPath !== "string" || marketPath.length === 0) continue;
      const res = await env.ASSETS.fetch(`${base}/${marketPath}`);
      if (!res.ok) continue;
      const payload = await res.json();
      const scored = scoreMarketPayload(payload, entry?.label || entry?.id || "unknown");
      if (scored) scoredMarkets.push(scored);
    }

    return ok(env, {
      radar: buildRadarFromMarkets(scoredMarkets),
    });
  } catch (e) {
    return error(env, 500, "MARKET_RADAR_FAILED", "Unable to build construction market radar", {
      message: e?.message || String(e),
    });
  }
}

export function __test_only__() {
  return {
    cycleInterpretation,
    scoreMarketPayload,
    buildRadarFromMarkets,
  };
}
