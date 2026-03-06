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
    permits_trend_pct: Number.isFinite(terminal?.activity_trends?.permits_trend_pct) ? terminal.activity_trends.permits_trend_pct : null,
    starts_trend_pct: Number.isFinite(terminal?.activity_trends?.starts_trend_pct) ? terminal.activity_trends.starts_trend_pct : null,
  };
}


function toPowerState(score) {
  if (score >= 65) return "strong";
  if (score >= 45) return "neutral";
  return "weak";
}

function clampScore(score) {
  if (!Number.isFinite(score)) return null;
  return Math.max(0, Math.min(100, Number(score.toFixed(1))));
}

function buildConstructionPowerFromMetrics(metrics) {
  const liqState = metrics.liquidity_state;
  const liqScore = metrics.liquidity_score;
  const riskScore = metrics.risk_score;
  const idx = metrics.construction_index;
  const commercial = metrics.commercial_pct_change;
  const housing = metrics.housing_pct_change;

  const bothNegative = commercial !== null && housing !== null && commercial < 0 && housing < 0;
  const bothPositiveOrFlat = commercial !== null && housing !== null && commercial >= -0.5 && housing >= -0.5;
  const bothExpanding = commercial !== null && housing !== null && commercial > 0 && housing > 0;
  const weakCommercial = commercial !== null && commercial < 0;

  let gc = 50;
  const gcDrivers = [];
  if (idx !== null && idx >= 55) {
    gc += 14;
    gcDrivers.push("construction index is firm");
  } else if (idx !== null && idx < 45) {
    gc -= 14;
    gcDrivers.push("construction index is weak");
  }
  if (liqState !== "tight") {
    gc += 10;
    gcDrivers.push("liquidity is not tight");
  } else {
    gc -= 16;
    gcDrivers.push("tight liquidity pressures buyout terms");
  }
  if (riskScore !== null && riskScore >= 55) {
    gc -= 10;
    gcDrivers.push("elevated risk constrains margin conversion");
  }

  let subs = 50;
  const subsDrivers = [];
  if (idx !== null && idx >= 50) {
    subs += 10;
    subsDrivers.push("activity is stable to expanding");
  } else if (idx !== null && idx < 45) {
    subs -= 12;
    subsDrivers.push("activity is in slowdown/contraction range");
  }
  if (riskScore !== null && riskScore < 60) {
    subs += 6;
    subsDrivers.push("risk backdrop is not collapsing");
  } else if (riskScore !== null && riskScore >= 70) {
    subs -= 10;
    subsDrivers.push("very high risk undermines trade-level pricing power");
  }

  let distributors = 50;
  const distributorDrivers = [];
  if (bothPositiveOrFlat) {
    distributors += 14;
    distributorDrivers.push("commercial and housing are positive or near-flat");
  }
  if (bothNegative) {
    distributors -= 16;
    distributorDrivers.push("broad demand softening across segments");
  } else if ((commercial !== null && commercial < -1) || (housing !== null && housing < -1)) {
    distributors -= 8;
    distributorDrivers.push("softness in at least one major demand segment");
  }

  let manufacturers = 50;
  const manufacturerDrivers = [];
  if (bothExpanding) {
    manufacturers += 16;
    manufacturerDrivers.push("both segments are expanding");
  } else if (bothNegative) {
    manufacturers -= 18;
    manufacturerDrivers.push("both segments are negative");
  }

  let developers = 50;
  const developerDrivers = [];
  if (liqState === "tight") {
    developers -= 16;
    developerDrivers.push("tight liquidity raises cost of capital");
  } else if (liqState === "easy") {
    developers += 14;
    developerDrivers.push("easier liquidity supports project optionality");
  }
  if (weakCommercial) {
    developers -= 8;
    developerDrivers.push("commercial demand is weak");
  }
  if (idx !== null && idx >= 60 && liqState === "easy") {
    developers += 8;
    developerDrivers.push("strong construction index with easy liquidity");
  }

  let lenders = 50;
  const lenderDrivers = [];
  if (liqState === "tight") {
    lenders += 12;
    lenderDrivers.push("tight liquidity improves lender term control");
  } else if (liqState === "easy") {
    lenders -= 8;
    lenderDrivers.push("easy liquidity reduces pricing leverage");
  }
  if (riskScore !== null && riskScore >= 75) {
    lenders -= 14;
    lenderDrivers.push("extreme risk deteriorates credit quality");
  } else if (riskScore !== null && riskScore >= 60) {
    lenders -= 6;
    lenderDrivers.push("elevated risk modestly weakens credit conditions");
  }

  const actorScores = {
    general_contractors: clampScore(gc),
    subcontractors: clampScore(subs),
    distributors: clampScore(distributors),
    manufacturers: clampScore(manufacturers),
    developers: clampScore(developers),
    lenders: clampScore(lenders),
  };

  const explanations = {
    general_contractors: gcDrivers,
    subcontractors: subsDrivers,
    distributors: distributorDrivers,
    manufacturers: manufacturerDrivers,
    developers: developerDrivers,
    lenders: lenderDrivers,
  };

  const power_index = {};
  for (const [actor, score] of Object.entries(actorScores)) {
    const actorDrivers = explanations[actor];
    power_index[actor] = {
      score,
      state: toPowerState(score),
      explanation:
        actorDrivers.length > 0
          ? actorDrivers.join("; ") + "."
          : "Conditions are mixed and broadly balanced.",
    };
  }

  const ordered = Object.entries(actorScores)
    .map(([actor, score]) => ({ actor, score }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.actor.localeCompare(b.actor);
    });

  const marginLeader = ordered[0]?.actor || "unknown";
  const mostConstrained = ordered[ordered.length - 1]?.actor || "unknown";

  return {
    power_index,
    power_summary: {
      margin_leader: marginLeader,
      most_constrained: mostConstrained,
      headline: `${marginLeader.replaceAll("_", " ")} lead pricing leverage while ${mostConstrained.replaceAll("_", " ")} face the tightest constraints.`,
    },
  };
}

function buildConstructionNowcastFromMetrics(metrics, activityTrends = null) {
  let score = 0;
  const drivers = [];
  const permitsTrend = Number.isFinite(activityTrends?.permits_trend_pct) ? activityTrends.permits_trend_pct : null;
  const startsTrend = Number.isFinite(activityTrends?.starts_trend_pct) ? activityTrends.starts_trend_pct : null;

  if (metrics.liquidity_state === "tight") {
    score += 1.4;
    drivers.push("tight liquidity adds downside pressure");
  } else if (metrics.liquidity_state === "easy") {
    score -= 1.0;
    drivers.push("easy liquidity supports forward activity");
  }

  if (permitsTrend !== null && permitsTrend < 0) {
    score += 0.9;
    drivers.push(`permits trend is negative (${permitsTrend.toFixed(2)}%)`);
  } else if (permitsTrend !== null && permitsTrend > 0) {
    score -= 0.6;
    drivers.push(`permits trend is positive (${permitsTrend.toFixed(2)}%)`);
  }

  if (startsTrend !== null && startsTrend < 0) {
    score += 0.9;
    drivers.push(`starts trend is negative (${startsTrend.toFixed(2)}%)`);
  } else if (startsTrend !== null && startsTrend > 0) {
    score -= 0.6;
    drivers.push(`starts trend is positive (${startsTrend.toFixed(2)}%)`);
  }

  if (metrics.commercial_pct_change !== null && metrics.commercial_pct_change < 0) {
    score += 0.7;
    drivers.push("commercial spending momentum is negative");
  } else if (metrics.commercial_pct_change !== null && metrics.commercial_pct_change > 0) {
    score -= 0.5;
    drivers.push("commercial spending momentum is positive");
  }

  if (metrics.housing_pct_change !== null && metrics.housing_pct_change < 0) {
    score += 0.7;
    drivers.push("housing spending momentum is negative");
  } else if (metrics.housing_pct_change !== null && metrics.housing_pct_change > 0) {
    score -= 0.5;
    drivers.push("housing spending momentum is positive");
  }

  if (metrics.construction_index !== null && metrics.construction_index < 45) {
    score += 1.0;
    drivers.push(`construction index is weak (${metrics.construction_index.toFixed(1)})`);
  } else if (metrics.construction_index !== null && metrics.construction_index >= 58) {
    score -= 0.8;
    drivers.push(`construction index is firm (${metrics.construction_index.toFixed(1)})`);
  }

  if (metrics.risk_score !== null && metrics.risk_score >= 60) {
    score += 1.0;
    drivers.push(`risk score is elevated (${metrics.risk_score.toFixed(1)})`);
  } else if (metrics.risk_score !== null && metrics.risk_score < 45) {
    score -= 0.5;
    drivers.push(`risk score is contained (${metrics.risk_score.toFixed(1)})`);
  }

  if (metrics.mortgage_rate !== null && metrics.mortgage_rate >= 7) {
    score += 0.5;
    drivers.push(`mortgage rate remains restrictive (${metrics.mortgage_rate.toFixed(2)}%)`);
  } else if (metrics.mortgage_rate !== null && metrics.mortgage_rate <= 5.5) {
    score -= 0.4;
    drivers.push(`mortgage rate is comparatively supportive (${metrics.mortgage_rate.toFixed(2)}%)`);
  }

  const next6 = score >= 1.75 ? "softening" : score <= -1.0 ? "improving" : "stable";
  const recessionProbability = Math.max(5, Math.min(95, Number((38 + score * 10).toFixed(1))));
  const confidence = Math.max(35, Math.min(90, Number((55 + Math.abs(score) * 10).toFixed(1))));

  return {
    next_6_months: next6,
    next_12_months_recession_probability: recessionProbability,
    confidence,
    drivers: drivers.slice(0, 5),
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

function buildStressIndex(terminal) {
  const metrics = extractTerminalInputs(terminal);
  let score = 35;
  const drivers = [];

  if (metrics.liquidity_state === "tight") {
    score += 22;
    drivers.push("tight liquidity");
  }
  if (metrics.risk_score !== null) {
    score += Math.max(0, (metrics.risk_score - 45) * 0.7);
    if (metrics.risk_score >= 55) drivers.push(`risk score ${metrics.risk_score.toFixed(1)}`);
  }
  if (metrics.construction_index !== null && metrics.construction_index < 50) {
    score += (50 - metrics.construction_index) * 0.9;
    drivers.push(`construction index ${metrics.construction_index.toFixed(1)}`);
  }
  if (metrics.commercial_pct_change !== null && metrics.commercial_pct_change < 0) score += 5;
  if (metrics.housing_pct_change !== null && metrics.housing_pct_change < 0) score += 5;

  const stressScore = clampScore(score);
  const state = stressScore >= 70 ? "high" : stressScore >= 50 ? "elevated" : "contained";
  const trend = terminal?.nowcast?.next_6_months === "softening" ? "rising" : stressScore >= 60 ? "elevated" : "stable";

  return {
    score: stressScore,
    state,
    trend,
    drivers: drivers.slice(0, 4),
    explanation:
      drivers.length > 0
        ? `Stress is ${state} from ${drivers.slice(0, 3).join("; ")}.`
        : "Stress is contained with mixed but stable inputs.",
  };
}

function buildEarlyWarning(terminal) {
  const nowcast = terminal.nowcast || { next_6_months: "stable" };
  const recession = terminal.recession_probability || { next_12_months: 0 };
  const stress = terminal.stress_index || { score: 0, state: "contained" };
  const riskFlags = [];
  if (nowcast.next_6_months === "softening") riskFlags.push("forward activity is softening");
  if (recession.next_12_months >= 50) riskFlags.push(`recession probability is ${recession.next_12_months.toFixed(1)}%`);
  if (stress.score >= 60) riskFlags.push(`stress index is ${stress.score.toFixed(1)}`);

  const state = riskFlags.length >= 3 ? "high" : riskFlags.length === 2 ? "medium" : "low";
  const score = state === "high" ? 80 : state === "medium" ? 60 : 35;
  const trend = nowcast.next_6_months === "softening" || recession.next_12_months >= 50 ? "rising" : "stable";

  return {
    state,
    score,
    trend,
    drivers: riskFlags,
    explanation: riskFlags.length > 0 ? riskFlags.slice(0, 2).join("; ") + "." : "No major cycle-risk flags are active.",
  };
}

function buildCapitalFlows(terminal) {
  const metrics = extractTerminalInputs(terminal);
  const lenderScore = terminal?.power_index?.lenders?.score ?? null;
  const defensive = metrics.liquidity_state === "tight" || (lenderScore !== null && lenderScore >= 60);
  const expansionary = metrics.liquidity_state === "easy" && (metrics.risk_score === null || metrics.risk_score < 55);

  const lending_growth = expansionary ? "expanding" : defensive ? "contracting" : "stable";
  const private_development_capital = defensive ? "selective" : expansionary ? "risk-on" : "balanced";
  const manufacturing_investment = metrics.construction_index !== null && metrics.construction_index >= 50 ? "supported" : "cautious";
  const infrastructure_spending = metrics.commercial_pct_change !== null && metrics.commercial_pct_change >= 0 ? "accelerating" : "stable";

  const headline = defensive
    ? "Credit is defensive with tighter underwriting and selective deployment."
    : expansionary
      ? "Financing conditions support broader project deployment."
      : "Capital allocation remains balanced with selective risk-taking.";

  return {
    lending_growth,
    private_development_capital,
    manufacturing_investment,
    infrastructure_spending,
    headline,
    explanation:
      defensive
        ? "Capital is concentrating in resilient projects and tighter credit structures."
        : expansionary
          ? "Capital is rotating toward growth projects as financing conditions improve."
          : "Capital allocation remains selective with balanced risk posture.",
  };
}

function buildMigrationIndex(heatmap, forecast) {
  const inbound_markets = (forecast?.strongest_next_12_months || heatmap?.hottest_markets || [])
    .slice(0, 5)
    .map((m) => ({
      market: m.market,
      score: Number.isFinite(m.forecast_score) ? m.forecast_score : m.score ?? null,
      explanation:
        typeof m.explanation === "string" && m.explanation.length > 0
          ? m.explanation
          : typeof m.note === "string" && m.note.length > 0
            ? m.note
            : "Deterministic migration ranking from relative construction momentum.",
    }));
  const outbound_markets = (forecast?.weakest_next_12_months || heatmap?.weakest_markets || [])
    .slice(0, 5)
    .map((m) => ({
      market: m.market,
      score: Number.isFinite(m.forecast_score) ? m.forecast_score : m.score ?? null,
      explanation:
        typeof m.explanation === "string" && m.explanation.length > 0
          ? m.explanation
          : typeof m.note === "string" && m.note.length > 0
            ? m.note
            : "Deterministic migration ranking from relative construction momentum.",
    }));
  const topInbound = inbound_markets[0]?.market || "unknown";
  const topOutbound = outbound_markets[0]?.market || "unknown";

  return {
    inbound_markets,
    outbound_markets,
    headline: `Relative demand momentum favors ${topInbound} over ${topOutbound}.`,
  };
}

function buildMarketTape(terminal) {
  const metrics = extractTerminalInputs(terminal);
  return {
    signal: isSubsectionFailure(terminal.signal) ? "unknown" : terminal.signal.signal,
    regime: isSubsectionFailure(terminal.regime) ? "unknown" : terminal.regime.regime,
    liquidity: metrics.liquidity_state || "unknown",
    risk: isSubsectionFailure(terminal.risk) ? "unknown" : terminal.risk.risk_level || "unknown",
    construction_index: metrics.construction_index,
    stress_index: terminal?.stress_index?.score ?? null,
    recession_probability: terminal?.recession_probability?.next_12_months ?? null,
    commercial_pct: metrics.commercial_pct_change,
    housing_pct: metrics.housing_pct_change,
    top_market: terminal?.migration_index?.inbound_markets?.[0]?.market || terminal?.forecast_summary?.strongest_market || "unknown",
    weakest_market: terminal?.migration_index?.outbound_markets?.[0]?.market || terminal?.forecast_summary?.weakest_market || "unknown",
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

async function tryBuildForecast(request, env, terminal = null) {
  const activeTerminal = terminal || await buildTerminalPayload(request, env);
  const scoredMarkets = await loadScoredMarketsFromAssets(env);
  if (isSubsectionFailure(scoredMarkets)) return scoredMarkets;
  return buildForecastFromMarkets(scoredMarkets, activeTerminal);
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
    if (dashboardResult.data.activity_trends) terminal.activity_trends = dashboardResult.data.activity_trends;
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

  const metrics = extractTerminalInputs(terminal);
  const power = buildConstructionPowerFromMetrics(metrics);
  terminal.power_index = power.power_index;
  terminal.power_summary = power.power_summary;
  terminal.nowcast = buildConstructionNowcastFromMetrics(metrics, terminal.activity_trends || null);
  terminal.alerts = buildConstructionAlerts(terminal);
  terminal.recession_probability = buildRecessionProbability(terminal);
  terminal.stress_index = buildStressIndex(terminal);
  terminal.stress_index_summary = terminal.stress_index.explanation;
  terminal.early_warning = buildEarlyWarning(terminal);
  terminal.early_warning_summary = terminal.early_warning.explanation;
  terminal.capital_flows = buildCapitalFlows(terminal);
  terminal.capital_flows_summary = terminal.capital_flows.explanation;
  terminal.forecast_summary = {
    strongest_market: "unknown",
    weakest_market: "unknown",
    headline: "Forecast summary unavailable",
  };
  terminal.migration_index = {
    inbound_markets: [],
    outbound_markets: [],
    headline: "Migration index unavailable until market forecast and heatmap are available.",
  };
  terminal.migration_summary = terminal.migration_index.headline;

  const marketRadar = await tryReadMarketRadar(env);
  if (!isSubsectionFailure(marketRadar) && marketRadar?.summary) {
    terminal.heatmap_summary = marketRadar.summary;
  } else {
    terminal.heatmap_summary = {
      top_strength_theme: "Heatmap unavailable",
      top_weakness_theme: "Heatmap unavailable",
    };
  }

  const forecast = await tryBuildForecast(request, env, terminal);
  if (!isSubsectionFailure(forecast)) {
    terminal.forecast_summary = {
      strongest_market: forecast.strongest_next_12_months[0]?.market || "unknown",
      weakest_market: forecast.weakest_next_12_months[0]?.market || "unknown",
      headline: forecast.summary?.headline || "Forecast summary unavailable",
    };
    terminal.migration_index = buildMigrationIndex(
      isSubsectionFailure(marketRadar) ? null : marketRadar,
      forecast
    );
    terminal.migration_summary = terminal.migration_index.headline;
  }

  terminal.market_tape = buildMarketTape(terminal);

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

function normalizeLabel(value) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function regimeModifier(regimeRaw) {
  const regime = normalizeLabel(regimeRaw);
  if (regime.includes("contraction")) return -8;
  if (regime.includes("slowdown")) return -4;
  if (regime.includes("late") && regime.includes("expansion")) return 3;
  if (regime.includes("expansion")) return 6;
  if (regime.includes("recovery")) return 2;
  return 0;
}

function signalModifier(signalRaw) {
  const signal = normalizeLabel(signalRaw);
  if (signal.includes("bull")) return 5;
  if (signal.includes("bear")) return -5;
  if (signal.includes("🟢")) return 4;
  if (signal.includes("🟡")) return 0;
  if (signal.includes("🔴")) return -4;
  return 0;
}

function noteThemeModifier(noteRaw) {
  const note = normalizeLabel(noteRaw);
  if (!note) return { score: 0, driver: null };

  const positiveHits = ["resilient", "strong", "expanding", "accelerating", "improving", "supportive"]
    .filter((token) => note.includes(token)).length;
  const negativeHits = ["soft", "weak", "tight", "slow", "contraction", "risk", "restrictive"]
    .filter((token) => note.includes(token)).length;

  if (positiveHits > negativeHits) return { score: 3, driver: "Resilient local market commentary" };
  if (negativeHits > positiveHits) return { score: -3, driver: "Softening local market commentary" };
  return { score: 0, driver: null };
}

function macroOverlayAdjustment(baseScore, metrics, nowcast, recessionProbability) {
  let adjustment = 0;
  const drivers = [];
  const vulnerable = baseScore < 50;

  if (nowcast?.next_6_months === "softening") {
    adjustment -= 2;
    drivers.push("National nowcast is softening");
  }

  if (Number.isFinite(recessionProbability?.next_12_months) && recessionProbability.next_12_months > 50) {
    const recessionPenalty = vulnerable ? -4 : -2;
    adjustment += recessionPenalty;
    drivers.push(vulnerable ? "Elevated recession risk penalizes weaker markets more" : "Elevated recession risk caps upside for stronger markets");
  }

  if (metrics.liquidity_state === "tight") {
    const liquidityPenalty = vulnerable ? -3 : -1;
    adjustment += liquidityPenalty;
    drivers.push(vulnerable ? "Tight liquidity amplifies downside for vulnerable markets" : "National liquidity remains restrictive");
  }

  return { adjustment, drivers };
}

function toForecastExplanation(market, direction, drivers) {
  const because = drivers.slice(0, 3).join(", ").toLowerCase();
  if (direction === "strengthening") {
    return `${market} remains likely to outperform because ${because}, though macro constraints temper the upside.`;
  }
  return `${market} is more likely to soften because ${because}, with macro pressure increasing downside risk over the next 12 months.`;
}

function buildForecastSummary(strongest, weakest) {
  const topStrong = strongest[0];
  const topWeak = weakest[0];
  const topStrengthTheme = topStrong?.drivers?.[0] || "Strength is concentrated in markets with resilient current conditions.";
  const topWeaknessTheme = topWeak?.drivers?.[0] || "Weakness is concentrated in markets exposed to restrictive macro conditions.";
  const headline = topStrong && topWeak
    ? `${topStrong.market} screens as the most likely strengthening market while ${topWeak.market} screens as the most likely to soften over the next 12 months.`
    : "Insufficient market coverage for a full strongest-vs-weakest split; forecast reflects available deterministic market signals.";

  return {
    top_strength_theme: topStrengthTheme,
    top_weakness_theme: topWeaknessTheme,
    headline,
  };
}

function scoreForecastMarket(market, context) {
  const currentScore = Number.isFinite(market.score) ? market.score : 50;
  const regimeAdj = regimeModifier(market.regime);
  const signalAdj = signalModifier(market.signal);
  const noteAdj = noteThemeModifier(market.note);
  const baseScore = currentScore + regimeAdj + signalAdj + noteAdj.score;
  const macro = macroOverlayAdjustment(baseScore, context.metrics, context.nowcast, context.recessionProbability);
  const forecastScore = clampScore(baseScore + macro.adjustment);
  const direction = forecastScore >= currentScore ? "strengthening" : "softening";

  const drivers = [
    currentScore >= 55 ? "Strong current market score" : currentScore <= 45 ? "Weak current market score" : "Balanced current market score",
    regimeAdj > 0 ? `${market.regime || "Positive"} regime` : regimeAdj < 0 ? `${market.regime || "Negative"} regime` : "Neutral regime",
    signalAdj > 0 ? "Bullish market signal" : signalAdj < 0 ? "Bearish market signal" : "Neutral market signal",
    ...(noteAdj.driver ? [noteAdj.driver] : []),
    ...macro.drivers,
  ].filter((driver, index, arr) => typeof driver === "string" && driver.length > 0 && arr.indexOf(driver) === index);

  return {
    market: market.market,
    forecast_score: forecastScore,
    current_score: clampScore(currentScore),
    direction,
    drivers: drivers.slice(0, 5),
    explanation: toForecastExplanation(market.market, direction, drivers),
  };
}

function buildForecastFromMarkets(scoredMarkets, terminal) {
  const metrics = extractTerminalInputs(terminal);
  const context = {
    metrics,
    nowcast: terminal?.nowcast || null,
    recessionProbability: terminal?.recession_probability || null,
  };

  if (!Array.isArray(scoredMarkets) || scoredMarkets.length === 0) {
    return {
      strongest_next_12_months: [],
      weakest_next_12_months: [],
      summary: buildForecastSummary([], []),
    };
  }

  const forecasted = scoredMarkets.map((market) => scoreForecastMarket(market, context));
  const strongest = [...forecasted]
    .sort((a, b) => (b.forecast_score - a.forecast_score) || a.market.localeCompare(b.market))
    .slice(0, Math.min(10, forecasted.length))
    .map((item) => ({ ...item, direction: "strengthening" }));
  const weakest = [...forecasted]
    .sort((a, b) => (a.forecast_score - b.forecast_score) || a.market.localeCompare(b.market))
    .slice(0, Math.min(10, forecasted.length))
    .map((item) => ({ ...item, direction: "softening" }));

  return {
    strongest_next_12_months: strongest,
    weakest_next_12_months: weakest,
    summary: buildForecastSummary(strongest, weakest),
  };
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


function toHeatmapPayload(radar) {
  if (isSubsectionFailure(radar)) {
    return {
      ok: false,
      error: {
        code: radar.error.code,
        message: radar.error.message,
        ...(radar.error.details ? { details: radar.error.details } : {}),
      },
    };
  }

  return {
    ok: true,
    hottest_markets: radar.hottest_markets,
    weakest_markets: radar.weakest_markets,
    summary: radar.summary,
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

async function loadScoredMarketsFromAssets(env) {
  if (!env.ASSETS || typeof env.ASSETS.fetch !== "function") {
    return subsectionError("ASSETS_NOT_CONFIGURED", "Static asset binding is not configured; cannot read dist/markets/*.json files");
  }

  const base = "http://assets";
  const marketsIndexRes = await env.ASSETS.fetch(`${base}/dist/markets/index.json`);
  if (!marketsIndexRes.ok) {
    return subsectionError("MARKETS_INDEX_MISSING", "Unable to read dist/markets/index.json", { status: marketsIndexRes.status });
  }

  const marketsIndex = await marketsIndexRes.json();
  const entries = Array.isArray(marketsIndex?.markets) ? marketsIndex.markets : [];
  if (entries.length === 0) {
    return subsectionError("MARKETS_INDEX_EMPTY", "No market entries found in dist/markets/index.json");
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

  if (scoredMarkets.length === 0) {
    return subsectionError(
      "MARKETS_DATA_UNUSABLE",
      "No market signal files contained a numeric indices.pressure_index.value for deterministic ranking"
    );
  }

  return scoredMarkets;
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
      heatmap_summary: !isSubsectionFailure(marketRadar) ? marketRadar.summary : marketRadar,
      operator_guidance: operatorActions(),
    };

    return ok(env, { brief });
  } catch (e) {
    return error(env, 500, "MORNING_BRIEF_FAILED", "Unable to build construction morning brief", {
      message: e?.message || String(e),
    });
  }
}

export async function handleConstructionPower(request, env) {
  try {
    const terminal = await buildTerminalPayload(request, env);
    return ok(env, {
      power_index: terminal.power_index,
      power_summary: terminal.power_summary,
    });
  } catch (e) {
    return error(env, 500, "POWER_FAILED", "Unable to build construction power index", {
      message: e?.message || String(e),
    });
  }
}

export async function handleConstructionNowcast(request, env) {
  try {
    const terminal = await buildTerminalPayload(request, env);
    return ok(env, {
      nowcast: terminal.nowcast,
    });
  } catch (e) {
    return error(env, 500, "NOWCAST_FAILED", "Unable to build construction nowcast", {
      message: e?.message || String(e),
    });
  }
}


export async function handleConstructionStressIndex(request, env) {
  try {
    const terminal = await buildTerminalPayload(request, env);
    return ok(env, { stress_index: terminal.stress_index });
  } catch (e) {
    return error(env, 500, "STRESS_INDEX_FAILED", "Unable to build construction stress index", {
      message: e?.message || String(e),
    });
  }
}

export async function handleConstructionEarlyWarning(request, env) {
  try {
    const terminal = await buildTerminalPayload(request, env);
    return ok(env, { early_warning: terminal.early_warning });
  } catch (e) {
    return error(env, 500, "EARLY_WARNING_FAILED", "Unable to build construction early warning", {
      message: e?.message || String(e),
    });
  }
}

export async function handleConstructionCapitalFlows(request, env) {
  try {
    const terminal = await buildTerminalPayload(request, env);
    return ok(env, { capital_flows: terminal.capital_flows });
  } catch (e) {
    return error(env, 500, "CAPITAL_FLOWS_FAILED", "Unable to build construction capital flows", {
      message: e?.message || String(e),
    });
  }
}

export async function handleConstructionMigrationIndex(request, env) {
  try {
    const terminal = await buildTerminalPayload(request, env);
    return ok(env, { migration_index: terminal.migration_index });
  } catch (e) {
    return error(env, 500, "MIGRATION_INDEX_FAILED", "Unable to build construction migration index", {
      message: e?.message || String(e),
    });
  }
}
export async function handleConstructionForecast(request, env) {
  try {
    const terminal = await buildTerminalPayload(request, env);
    const forecast = await tryBuildForecast(request, env, terminal);

    if (isSubsectionFailure(forecast)) {
      return ok(env, {
        forecast: {
          strongest_next_12_months: [],
          weakest_next_12_months: [],
          summary: {
            top_strength_theme: "Forecast unavailable",
            top_weakness_theme: "Forecast unavailable",
            headline: forecast.error.message,
          },
        },
      });
    }

    return ok(env, { forecast });
  } catch (e) {
    return error(env, 500, "FORECAST_FAILED", "Unable to build construction market forecast", {
      message: e?.message || String(e),
    });
  }
}

export async function handleConstructionHeatmap(env) {
  try {
    const radarResponse = await handleConstructionMarketRadar(env);
    if (!(radarResponse instanceof Response)) {
      return ok(env, {
        heatmap: {
          ok: false,
          error: { code: "HEATMAP_INVALID", message: "Unexpected market radar response type" },
        },
      });
    }

    if (radarResponse.status >= 400) {
      const payload = await safeJsonResponseBody(radarResponse);
      return ok(env, {
        heatmap: {
          ok: false,
          error: {
            code: payload?.error?.code || "HEATMAP_FAILED",
            message: payload?.error?.message || "Unable to build construction heatmap",
            ...(payload?.error?.details ? { details: payload.error.details } : {}),
          },
        },
      });
    }

    const payload = await safeJsonResponseBody(radarResponse);
    return ok(env, {
      heatmap: toHeatmapPayload(payload?.radar || subsectionError("HEATMAP_INVALID", "Market radar payload missing radar")),
    });
  } catch (e) {
    return error(env, 500, "HEATMAP_FAILED", "Unable to build construction heatmap", {
      message: e?.message || String(e),
    });
  }
}

export async function handleConstructionMarketRadar(env) {
  try {
    const scoredMarkets = await loadScoredMarketsFromAssets(env);
    if (isSubsectionFailure(scoredMarkets)) {
      return ok(env, { radar: scoredMarkets });
    }
    return ok(env, { radar: buildRadarFromMarkets(scoredMarkets) });
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
    buildStressIndex,
    buildEarlyWarning,
    buildCapitalFlows,
    buildMigrationIndex,
    buildMarketTape,
    extractTerminalInputs,
    buildConstructionPowerFromMetrics,
    buildConstructionNowcastFromMetrics,
    toHeatmapPayload,
    buildForecastFromMarkets,
    scoreForecastMarket,
  };
}
