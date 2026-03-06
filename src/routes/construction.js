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

function isSubsectionFailure(section) {
  return !!(section && typeof section === "object" && section.ok === false && section.error);
}

function extractTerminalInputs(terminal) {
  const liquidity = isSubsectionFailure(terminal?.liquidity) ? null : terminal?.liquidity || null;
  const risk = isSubsectionFailure(terminal?.risk) ? null : terminal?.risk || null;
  const spending = isSubsectionFailure(terminal?.spending) ? null : terminal?.spending || null;
  const constructionIndex =
    terminal?.construction_index && typeof terminal.construction_index === "object"
      ? null
      : Number.isFinite(terminal?.construction_index)
        ? terminal.construction_index
        : null;

  const commercialPct = Number.isFinite(spending?.commercial?.pct_change_ytd_vs_pytd)
    ? spending.commercial.pct_change_ytd_vs_pytd
    : null;
  const housingPct = Number.isFinite(spending?.housing?.pct_change_ytd_vs_pytd)
    ? spending.housing.pct_change_ytd_vs_pytd
    : null;

  return {
    liquidity_state: typeof liquidity?.liquidity_state === "string" ? liquidity.liquidity_state : null,
    liquidity_score: Number.isFinite(liquidity?.liquidity_score) ? liquidity.liquidity_score : null,
    risk_score: Number.isFinite(risk?.risk_score) ? risk.risk_score : null,
    construction_index: constructionIndex,
    commercial_pct_change: commercialPct,
    housing_pct_change: housingPct,
    mortgage_rate: Number.isFinite(liquidity?.mortgage_rate) ? liquidity.mortgage_rate : null,
  };
}

function buildConstructionAlerts(terminal) {
  const metrics = extractTerminalInputs(terminal);
  const alerts = [];
  const bothNegative = metrics.commercial_pct_change !== null && metrics.housing_pct_change !== null
    && metrics.commercial_pct_change < 0 && metrics.housing_pct_change < 0;
  const marketDivergence =
    metrics.commercial_pct_change !== null
    && metrics.housing_pct_change !== null
    && ((metrics.commercial_pct_change >= 0 && metrics.housing_pct_change < 0)
      || (metrics.commercial_pct_change < 0 && metrics.housing_pct_change >= 0));

  if (metrics.liquidity_state === "tight") {
    alerts.push({
      code: "LIQUIDITY_TIGHTENING",
      severity: "medium",
      headline: "Liquidity conditions are tight",
      explanation: "Credit conditions remain restrictive, pressuring project starts and refinancing flexibility.",
    });
  }

  if (metrics.risk_score !== null && metrics.risk_score >= 55) {
    alerts.push({
      code: "ELEVATED_RISK",
      severity: "medium",
      headline: "Macro-construction risk is elevated",
      explanation: `Risk score is ${metrics.risk_score.toFixed(1)}, above the elevated risk threshold of 55.`,
    });
  }

  if (metrics.commercial_pct_change !== null && metrics.commercial_pct_change < 0) {
    alerts.push({
      code: "COMMERCIAL_WEAKNESS",
      severity: "medium",
      headline: "Commercial spending is below prior-year pace",
      explanation: `Commercial YTD vs PYTD is ${metrics.commercial_pct_change.toFixed(2)}%, indicating softer nonresidential momentum.`,
    });
  }

  if (metrics.housing_pct_change !== null && metrics.housing_pct_change < 0) {
    alerts.push({
      code: "HOUSING_WEAKNESS",
      severity: "medium",
      headline: "Housing spending is below prior-year pace",
      explanation: `Housing YTD vs PYTD is ${metrics.housing_pct_change.toFixed(2)}%, signaling residential softening.`,
    });
  }

  if (bothNegative) {
    alerts.push({
      code: "BROAD_SLOWDOWN",
      severity: metrics.liquidity_state === "tight" ? "high" : "medium",
      headline: "Broad spending slowdown is active",
      explanation: "Both commercial and housing spending are negative year-over-year, indicating a broad slowdown.",
    });
  }

  if (marketDivergence) {
    alerts.push({
      code: "MARKET_DIVERGENCE",
      severity: "medium",
      headline: "Market segments are diverging",
      explanation: "One major spending segment is positive while the other is negative, increasing planning uncertainty.",
    });
  }

  if (metrics.construction_index !== null && metrics.construction_index < 45 && metrics.liquidity_state === "tight") {
    alerts.push({
      code: "CONSTRUCTION_CONTRACTION_RISK",
      severity: "high",
      headline: "Construction contraction risk is high",
      explanation: `Construction index is ${metrics.construction_index.toFixed(1)} with tight liquidity, a contraction-risk combination.`,
    });
  }

  return alerts;
}

function buildRecessionProbability(terminal) {
  const metrics = extractTerminalInputs(terminal);
  let probability = 20;
  const drivers = [];

  if (metrics.liquidity_state === "tight") {
    probability += 20;
    drivers.push("tight liquidity");
  }

  if (metrics.risk_score !== null && metrics.risk_score >= 60) {
    probability += 15;
    drivers.push(`risk score ${metrics.risk_score.toFixed(1)} (>=60)`);
  } else if (metrics.risk_score !== null && metrics.risk_score >= 50) {
    probability += 10;
    drivers.push(`risk score ${metrics.risk_score.toFixed(1)} (50-59.9)`);
  }

  if (metrics.construction_index !== null && metrics.construction_index < 45) {
    probability += 15;
    drivers.push(`construction index ${metrics.construction_index.toFixed(1)} (<45)`);
  } else if (metrics.construction_index !== null && metrics.construction_index < 50) {
    probability += 10;
    drivers.push(`construction index ${metrics.construction_index.toFixed(1)} (45-49.9)`);
  }

  if (metrics.commercial_pct_change !== null && metrics.commercial_pct_change < 0) {
    probability += 10;
    drivers.push("commercial spending negative");
  }

  if (metrics.housing_pct_change !== null && metrics.housing_pct_change < 0) {
    probability += 10;
    drivers.push("housing spending negative");
  }

  if (
    metrics.commercial_pct_change !== null
    && metrics.housing_pct_change !== null
    && metrics.commercial_pct_change < 0
    && metrics.housing_pct_change < 0
  ) {
    probability += 10;
    drivers.push("both spending segments negative");
  }

  if (metrics.mortgage_rate !== null && metrics.mortgage_rate >= 7) {
    probability += 5;
    drivers.push(`mortgage rate ${metrics.mortgage_rate.toFixed(2)}% (>=7)`);
  }

  probability = Math.max(0, Math.min(100, probability));
  const trend = probability >= 55 ? "rising" : probability >= 35 ? "stable" : "falling";

  const explanationDrivers = drivers.slice(0, 3);
  const explanation =
    explanationDrivers.length > 0
      ? `Primary drivers: ${explanationDrivers.join("; ")}.`
      : "Primary drivers: mixed conditions with no major downside triggers.";

  return {
    next_12_months: Number(probability.toFixed(1)),
    trend,
    explanation,
  };
}

async function tryReadMarketRadar(env) {
  const radarResponse = await handleConstructionMarketRadar(env);
  if (!(radarResponse instanceof Response)) {
    return subsectionError("MARKET_RADAR_FAILED", "Unexpected market radar response type");
  }
  if (radarResponse.status >= 400) {
    const payload = await safeJsonResponseBody(radarResponse);
    return subsectionError(
      payload?.error?.code || "MARKET_RADAR_FAILED",
      payload?.error?.message || "Unable to build market radar",
      payload?.error?.details || { status: radarResponse.status }
    );
  }

  const payload = await safeJsonResponseBody(radarResponse);
  return payload?.radar || subsectionError("MARKET_RADAR_INVALID", "Market radar payload missing radar");
}

async function buildTerminalPayload(request, env) {
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
    if (dashboardResult.data.cycle) terminal.cycle = dashboardResult.data.cycle;
    if (dashboardResult.data.power_index !== undefined) terminal.power_index = dashboardResult.data.power_index;
    if (dashboardResult.data.power_summary) terminal.power_summary = dashboardResult.data.power_summary;
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

  terminal.alerts = buildConstructionAlerts(terminal);
  terminal.recession_probability = buildRecessionProbability(terminal);
  return terminal;
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
    const terminal = await buildTerminalPayload(request, env);
    return ok(env, { terminal });
  } catch (e) {
    return error(env, 500, "TERMINAL_FAILED", "Unable to build construction terminal", {
      message: e?.message || String(e),
    });
  }
}

export async function handleConstructionAlerts(request, env) {
  try {
    const terminal = await buildTerminalPayload(request, env);
    return ok(env, { alerts: buildConstructionAlerts(terminal) });
  } catch (e) {
    return error(env, 500, "ALERTS_FAILED", "Unable to build construction alerts", {
      message: e?.message || String(e),
    });
  }
}

export async function handleConstructionRecessionProbability(request, env) {
  try {
    const terminal = await buildTerminalPayload(request, env);
    return ok(env, { recession_probability: buildRecessionProbability(terminal) });
  } catch (e) {
    return error(env, 500, "RECESSION_PROBABILITY_FAILED", "Unable to estimate construction recession probability", {
      message: e?.message || String(e),
    });
  }
}

export async function handleConstructionMorningBrief(request, env) {
  try {
    const terminal = await buildTerminalPayload(request, env);
    const marketRadar = await tryReadMarketRadar(env);
    const metrics = extractTerminalInputs(terminal);

    const brief = {
      title: "Construction Morning Brief",
      market_signal: {
        signal: isSubsectionFailure(terminal.signal) ? "unknown" : terminal.signal.signal,
        regime: isSubsectionFailure(terminal.regime) ? "unknown" : terminal.regime.regime,
        liquidity_state: metrics.liquidity_state || "unknown",
        risk_level: isSubsectionFailure(terminal.risk) ? "unknown" : terminal.risk.risk_level,
        construction_index: metrics.construction_index,
      },
      spending: {
        commercial: terminal.spending?.commercial || subsectionError("SPENDING_UNAVAILABLE", "Commercial spending unavailable"),
        housing: terminal.spending?.housing || subsectionError("SPENDING_UNAVAILABLE", "Housing spending unavailable"),
        takeaway:
          metrics.commercial_pct_change !== null && metrics.housing_pct_change !== null
            ? metrics.commercial_pct_change < 0 && metrics.housing_pct_change < 0
              ? "Both major segments are below prior-year pace; preserve optionality on new starts."
              : metrics.commercial_pct_change >= 0 && metrics.housing_pct_change >= 0
                ? "Commercial and housing are both above prior-year pace; execution conditions are comparatively supportive."
                : "Segment divergence persists; prioritize local-market selectivity and disciplined underwriting."
            : "Spending data is incomplete; rely on liquidity and risk posture until updates arrive.",
      },
      market_radar: marketRadar,
      operator_guidance: operatorActions(),
    };

    return ok(env, { brief });
  } catch (e) {
    return error(env, 500, "MORNING_BRIEF_FAILED", "Unable to build construction morning brief", {
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
    buildConstructionAlerts,
    buildRecessionProbability,
    extractTerminalInputs,
  };
}
