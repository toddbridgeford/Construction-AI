import { error, ok } from "../lib/http.js";
import { MARKETS_INDEX_ASSET_PATH, validateAssetRootRelativePath } from "../lib/markets_assets.js";
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
    subcontractor: "Prioritize escalation clauses and shorter quote validity where input volatility is rising.",
    developer: "Stress-test GMP assumptions against labor and material volatility before locking starts.",
    lender: "Monitor commercial exposure and tightening credit conditions.",
    supplier: "Protect lead-time reliability and tighten terms where contractor margin stress is climbing.",
  };
}

function toPressureState(score) {
  if (score >= 75) return "severe";
  if (score >= 60) return "elevated";
  if (score >= 40) return "moderate";
  return "low";
}

function toBacklogQualityState(score) {
  if (score >= 67) return "strong";
  if (score >= 45) return "mixed";
  return "weak";
}

function toCounterpartyQualityState(score) {
  if (score >= 67) return "strong";
  if (score >= 45) return "mixed";
  return "weak";
}

function buildBacklogQualityModel(terminal) {
  const metrics = extractTerminalInputs(terminal);
  const recessionProb = Number.isFinite(terminal?.recession_probability?.next_12_months)
    ? terminal.recession_probability.next_12_months
    : null;
  const earlyWarningScore = Number.isFinite(terminal?.early_warning?.score) ? terminal.early_warning.score : null;
  const stressScore = Number.isFinite(terminal?.stress_index?.score) ? terminal.stress_index.score : null;
  const marginPressure = Number.isFinite(terminal?.margin_pressure?.score) ? terminal.margin_pressure.score : null;

  let score = 58;
  const drivers = [];

  if (metrics.commercial_pct_change !== null && metrics.housing_pct_change !== null) {
    if (metrics.commercial_pct_change >= 0 && metrics.housing_pct_change >= 0) {
      score += 12;
      drivers.push(`commercial and housing spending are both positive (${metrics.commercial_pct_change.toFixed(2)}%, ${metrics.housing_pct_change.toFixed(2)}%)`);
    } else if (metrics.commercial_pct_change < 0 && metrics.housing_pct_change < 0) {
      score -= 18;
      drivers.push("commercial and housing spending are both negative year-over-year");
    } else {
      score -= 5;
      drivers.push("spending segments are diverging, reducing backlog quality confidence");
    }
  }

  if (recessionProb !== null) {
    if (recessionProb >= 65) {
      score -= 14;
      drivers.push(`recession probability is elevated (${recessionProb.toFixed(1)}%)`);
    } else if (recessionProb <= 35) {
      score += 6;
      drivers.push(`recession probability is contained (${recessionProb.toFixed(1)}%)`);
    }
  }

  if (earlyWarningScore !== null) {
    if (earlyWarningScore >= 65) {
      score -= 10;
      drivers.push(`early-warning score is elevated (${earlyWarningScore.toFixed(1)})`);
    } else if (earlyWarningScore <= 35) {
      score += 4;
      drivers.push(`early-warning score is low (${earlyWarningScore.toFixed(1)})`);
    }
  }

  if (stressScore !== null) {
    if (stressScore >= 65) {
      score -= 10;
      drivers.push(`stress index is elevated (${stressScore.toFixed(1)})`);
    } else if (stressScore <= 40) {
      score += 5;
      drivers.push(`stress index is contained (${stressScore.toFixed(1)})`);
    }
  }

  if (metrics.starts_trend_pct !== null && metrics.permits_trend_pct !== null
      && metrics.starts_trend_pct - metrics.permits_trend_pct >= 1.5
      && metrics.liquidity_state === "tight") {
    score -= 8;
    drivers.push("starts are outpacing permits while liquidity is tight, increasing speculative conversion risk");
  }

  if (marginPressure !== null && marginPressure >= 60) {
    score -= 8;
    drivers.push(`margin pressure is elevated (${marginPressure.toFixed(1)})`);
  }

  const finalScore = clampScore(score);
  const state = toBacklogQualityState(finalScore);
  return {
    score: finalScore,
    state,
    drivers: drivers.slice(0, 6),
    explanation: `Backlog quality is ${state} based on ${drivers.slice(0, 3).join("; ")}.`,
  };
}

function buildBidIntensityModel(terminal) {
  const metrics = extractTerminalInputs(terminal);
  const backlog = terminal?.backlog_quality || buildBacklogQualityModel(terminal);
  const laborShock = terminal?.labor_shock || buildLaborShockModel(terminal);
  const gcPower = Number.isFinite(terminal?.power_index?.general_contractors?.score) ? terminal.power_index.general_contractors.score : null;
  const subPower = Number.isFinite(terminal?.power_index?.subcontractors?.score) ? terminal.power_index.subcontractors.score : null;
  const devPower = Number.isFinite(terminal?.power_index?.developers?.score) ? terminal.power_index.developers.score : null;
  const topMarketScore = Number.isFinite(terminal?.migration_index?.inbound_markets?.[0]?.score)
    ? terminal.migration_index.inbound_markets[0].score
    : null;

  let score = 34;
  const drivers = [];

  if (metrics.construction_index !== null) {
    if (metrics.construction_index >= 55) {
      score += 16;
      drivers.push(`construction index is firm (${metrics.construction_index.toFixed(1)})`);
    } else if (metrics.construction_index < 46) {
      score -= 10;
      drivers.push(`construction index is soft (${metrics.construction_index.toFixed(1)})`);
    }
  }

  if (metrics.permits_trend_pct !== null && metrics.starts_trend_pct !== null) {
    const activityTrend = (metrics.permits_trend_pct + metrics.starts_trend_pct) / 2;
    if (activityTrend > 1.0) {
      score += 10;
      drivers.push(`permits/starts trend is positive (${activityTrend.toFixed(2)}%)`);
    } else if (activityTrend < -1.0) {
      score -= 8;
      drivers.push(`permits/starts trend is negative (${activityTrend.toFixed(2)}%)`);
    }
  }

  if (backlog.state === "strong") {
    score += 10;
    drivers.push("backlog quality is strong, sustaining pursuit appetite");
  } else if (backlog.state === "weak") {
    score -= 9;
    drivers.push("backlog quality is weak, reducing pursuit appetite");
  }

  if (laborShock.score >= 60) {
    score += 9;
    drivers.push(`labor shock is elevated (${laborShock.score.toFixed(1)}), crowding qualified bidder capacity`);
  }

  if (gcPower !== null && subPower !== null && devPower !== null) {
    const competitiveComposite = (gcPower + subPower + devPower) / 3;
    if (competitiveComposite >= 55) {
      score += 8;
      drivers.push(`operator competition composite is elevated (${competitiveComposite.toFixed(1)})`);
    }
  }

  if (topMarketScore !== null && topMarketScore >= 60) {
    score += 6;
    drivers.push(`top inbound metros remain attractive (${topMarketScore.toFixed(1)})`);
  }

  if (metrics.liquidity_state === "tight") {
    score -= 5;
    drivers.push("tight liquidity screens out lower-conviction pursuits");
  }

  const finalScore = clampScore(score);
  const state = toPressureState(finalScore);
  return {
    score: finalScore,
    state,
    drivers: drivers.slice(0, 6),
    explanation: `Bid intensity is ${state} from ${drivers.slice(0, 3).join("; ")}.`,
  };
}

function buildProjectRiskModel(terminal) {
  const backlog = terminal?.backlog_quality || buildBacklogQualityModel(terminal);
  const laborShock = terminal?.labor_shock || buildLaborShockModel(terminal);
  const marginPressure = terminal?.margin_pressure || buildMarginPressureModel(terminal);
  const recessionProb = Number.isFinite(terminal?.recession_probability?.next_12_months)
    ? terminal.recession_probability.next_12_months
    : null;
  const weakMarketScore = Number.isFinite(terminal?.migration_index?.outbound_markets?.[0]?.score)
    ? terminal.migration_index.outbound_markets[0].score
    : null;
  const weakMarketName = terminal?.migration_index?.outbound_markets?.[0]?.market || "softer metros";

  let score = 28;
  const drivers = [];

  if (backlog.state === "weak") {
    score += 24;
    drivers.push("backlog quality is weak");
  } else if (backlog.state === "mixed") {
    score += 10;
    drivers.push("backlog quality is mixed");
  } else {
    score -= 8;
    drivers.push("backlog quality is strong");
  }

  if (laborShock.score >= 60) {
    score += 15;
    drivers.push(`labor shock is elevated (${laborShock.score.toFixed(1)})`);
  }

  if (marginPressure.score >= 60) {
    score += 16;
    drivers.push(`margin pressure is elevated (${marginPressure.score.toFixed(1)})`);
  }

  if (recessionProb !== null) {
    if (recessionProb >= 60) {
      score += 14;
      drivers.push(`recession probability is elevated (${recessionProb.toFixed(1)}%)`);
    } else if (recessionProb < 35) {
      score -= 6;
      drivers.push(`recession probability is contained (${recessionProb.toFixed(1)}%)`);
    }
  }

  if (weakMarketScore !== null && weakMarketScore <= 45) {
    score += 10;
    drivers.push(`soft metros are screening poorly (e.g., ${weakMarketName} at ${weakMarketScore.toFixed(1)})`);
  }

  const finalScore = clampScore(score);
  const state = toPressureState(finalScore);
  return {
    score: finalScore,
    state,
    drivers: drivers.slice(0, 6),
    explanation: `Project delay/cancellation risk is ${state} due to ${drivers.slice(0, 3).join("; ")}.`,
  };
}

function buildReceivablesRiskModel(terminal) {
  const backlog = terminal?.backlog_quality || buildBacklogQualityModel(terminal);
  const projectRisk = terminal?.project_risk || buildProjectRiskModel(terminal);
  const marginPressure = terminal?.margin_pressure || buildMarginPressureModel(terminal);
  const developerPower = Number.isFinite(terminal?.power_index?.developers?.score) ? terminal.power_index.developers.score : null;
  const weakMarketScore = Number.isFinite(terminal?.migration_index?.outbound_markets?.[0]?.score)
    ? terminal.migration_index.outbound_markets[0].score
    : null;
  const weakMarketName = terminal?.migration_index?.outbound_markets?.[0]?.market || "weaker metros";

  let score = 26;
  const drivers = [];

  if (backlog.state === "weak") {
    score += 20;
    drivers.push("backlog quality is weak");
  } else if (backlog.state === "mixed") {
    score += 8;
    drivers.push("backlog quality is mixed");
  }

  if (projectRisk.score >= 60) {
    score += 19;
    drivers.push(`project risk is elevated (${projectRisk.score.toFixed(1)})`);
  } else if (projectRisk.score >= 45) {
    score += 9;
    drivers.push(`project risk is moderate (${projectRisk.score.toFixed(1)})`);
  }

  if (weakMarketScore !== null && weakMarketScore <= 45) {
    score += 11;
    drivers.push(`${weakMarketName} is deteriorating (${weakMarketScore.toFixed(1)})`);
  }

  if (developerPower !== null) {
    if (developerPower <= 44) {
      score += 10;
      drivers.push(`developer balance-sheet flexibility is constrained (${developerPower.toFixed(1)})`);
    } else if (developerPower >= 58) {
      score -= 5;
      drivers.push(`developer capacity is supportive (${developerPower.toFixed(1)})`);
    }
  }

  if (marginPressure.score >= 60) {
    score += 12;
    drivers.push(`margin pressure is elevated (${marginPressure.score.toFixed(1)})`);
  }

  const finalScore = clampScore(score);
  const state = toPressureState(finalScore);
  return {
    score: finalScore,
    state,
    drivers: drivers.slice(0, 6),
    explanation: `Receivables risk is ${state} due to ${drivers.slice(0, 4).join("; ")}.`,
  };
}

function buildPaymentDelayRiskModel(terminal) {
  const projectRisk = terminal?.project_risk || buildProjectRiskModel(terminal);
  const metrics = extractTerminalInputs(terminal);
  const lenderPower = Number.isFinite(terminal?.power_index?.lenders?.score) ? terminal.power_index.lenders.score : null;
  const weakMarketScore = Number.isFinite(terminal?.migration_index?.outbound_markets?.[0]?.score)
    ? terminal.migration_index.outbound_markets[0].score
    : null;

  let score = 24;
  const drivers = [];

  if (lenderPower !== null) {
    if (lenderPower <= 46) {
      score += 20;
      drivers.push(`lenders are cautious (${lenderPower.toFixed(1)})`);
    } else if (lenderPower >= 58) {
      score -= 8;
      drivers.push(`lender risk appetite remains supportive (${lenderPower.toFixed(1)})`);
    }
  }

  if (metrics.liquidity_state === "tight") {
    score += 15;
    drivers.push("liquidity is tight across the payment chain");
  } else if (metrics.liquidity_state === "neutral") {
    score += 7;
    drivers.push("liquidity is neutral, reducing payment buffer capacity");
  }

  if (projectRisk.score >= 60) {
    score += 14;
    drivers.push(`project risk is elevated (${projectRisk.score.toFixed(1)})`);
  }

  if (metrics.commercial_pct_change !== null && metrics.commercial_pct_change < 0) {
    score += 12;
    drivers.push(`commercial spending softness persists (${metrics.commercial_pct_change.toFixed(2)}%)`);
  }

  if (weakMarketScore !== null && weakMarketScore <= 45) {
    score += 10;
    drivers.push(`weaker metros remain under pressure (${weakMarketScore.toFixed(1)})`);
  }

  const finalScore = clampScore(score);
  const state = toPressureState(finalScore);
  return {
    score: finalScore,
    state,
    drivers: drivers.slice(0, 6),
    explanation: `Payment delay risk is ${state} due to ${drivers.slice(0, 4).join("; ")}.`,
  };
}

function buildCollectionsStressModel(terminal) {
  const receivablesRisk = terminal?.receivables_risk || buildReceivablesRiskModel(terminal);
  const paymentDelayRisk = terminal?.payment_delay_risk || buildPaymentDelayRiskModel(terminal);
  const marginPressure = terminal?.margin_pressure || buildMarginPressureModel(terminal);
  const backlog = terminal?.backlog_quality || buildBacklogQualityModel(terminal);
  const subPower = Number.isFinite(terminal?.power_index?.subcontractors?.score) ? terminal.power_index.subcontractors.score : null;

  let score = receivablesRisk.score * 0.45 + paymentDelayRisk.score * 0.4;
  const drivers = [
    `receivables risk score ${receivablesRisk.score.toFixed(1)}`,
    `payment delay risk score ${paymentDelayRisk.score.toFixed(1)}`,
  ];

  if (subPower !== null && subPower < 50) {
    score += 10;
    drivers.push(`subcontractor working-capital leverage is weak (${subPower.toFixed(1)})`);
  }

  if (marginPressure.score >= 60) {
    score += 10;
    drivers.push(`margin pressure is elevated (${marginPressure.score.toFixed(1)})`);
  }

  if (backlog.state === "weak") {
    score += 10;
    drivers.push("backlog conversion quality is weak");
  }

  const finalScore = clampScore(score);
  const state = toPressureState(finalScore);
  return {
    score: finalScore,
    state,
    drivers: drivers.slice(0, 6),
    explanation: `Collections stress is ${state} due to ${drivers.slice(0, 4).join("; ")}.`,
  };
}

function buildOwnerRiskModel(terminal) {
  const receivablesRisk = terminal?.receivables_risk || buildReceivablesRiskModel(terminal);
  const projectRisk = terminal?.project_risk || buildProjectRiskModel(terminal);
  const collectionsStress = terminal?.collections_stress || buildCollectionsStressModel(terminal);
  const marginPressure = terminal?.margin_pressure || buildMarginPressureModel(terminal);
  const weakMarketScore = Number.isFinite(terminal?.migration_index?.outbound_markets?.[0]?.score)
    ? terminal.migration_index.outbound_markets[0].score
    : null;
  const weakMarketName = terminal?.migration_index?.outbound_markets?.[0]?.market || "weaker metros";

  let score = 24;
  const drivers = [];

  if (receivablesRisk.score >= 60) {
    score += 22;
    drivers.push(`receivables risk is elevated (${receivablesRisk.score.toFixed(1)})`);
  } else if (receivablesRisk.score >= 45) {
    score += 10;
    drivers.push(`receivables risk is moderate (${receivablesRisk.score.toFixed(1)})`);
  }

  if (projectRisk.score >= 60) {
    score += 18;
    drivers.push(`project risk is elevated (${projectRisk.score.toFixed(1)})`);
  }

  if (collectionsStress.score >= 60) {
    score += 16;
    drivers.push(`collections stress is elevated (${collectionsStress.score.toFixed(1)})`);
  }

  if (marginPressure.score >= 60) {
    score += 10;
    drivers.push(`margin pressure is elevated (${marginPressure.score.toFixed(1)})`);
  }

  if (weakMarketScore !== null && weakMarketScore <= 45) {
    score += 12;
    drivers.push(`${weakMarketName} is deteriorating (${weakMarketScore.toFixed(1)})`);
  }

  const finalScore = clampScore(score);
  const state = toPressureState(finalScore);
  return {
    score: finalScore,
    state,
    drivers: drivers.slice(0, 6),
    explanation: `Owner risk is ${state} due to ${drivers.slice(0, 4).join("; ")}.`,
  };
}

function buildDeveloperFragilityModel(terminal) {
  const backlog = terminal?.backlog_quality || buildBacklogQualityModel(terminal);
  const paymentDelayRisk = terminal?.payment_delay_risk || buildPaymentDelayRiskModel(terminal);
  const collectionsStress = terminal?.collections_stress || buildCollectionsStressModel(terminal);
  const developerPower = Number.isFinite(terminal?.power_index?.developers?.score) ? terminal.power_index.developers.score : null;
  const metrics = extractTerminalInputs(terminal);

  let score = 22;
  const drivers = [];

  if (developerPower !== null) {
    if (developerPower <= 44) {
      score += 24;
      drivers.push(`developer power is weak (${developerPower.toFixed(1)})`);
    } else if (developerPower < 55) {
      score += 10;
      drivers.push(`developer power is mixed (${developerPower.toFixed(1)})`);
    } else {
      score -= 6;
      drivers.push(`developer power is supportive (${developerPower.toFixed(1)})`);
    }
  }

  if (backlog.state === "weak") {
    score += 17;
    drivers.push("backlog quality is weak");
  } else if (backlog.state === "mixed") {
    score += 8;
    drivers.push("backlog quality is mixed");
  }

  if (paymentDelayRisk.score >= 60) {
    score += 16;
    drivers.push(`payment delay risk is elevated (${paymentDelayRisk.score.toFixed(1)})`);
  }

  if (collectionsStress.score >= 60) {
    score += 14;
    drivers.push(`collections stress is elevated (${collectionsStress.score.toFixed(1)})`);
  }

  if (metrics.liquidity_state === "tight" && backlog.state !== "strong") {
    score += 10;
    drivers.push("tight liquidity is reducing speculative project security");
  }

  const finalScore = clampScore(score);
  const state = toPressureState(finalScore);
  return {
    score: finalScore,
    state,
    drivers: drivers.slice(0, 6),
    explanation: `Developer fragility is ${state} due to ${drivers.slice(0, 4).join("; ")}.`,
  };
}

function buildLenderPullbackRiskModel(terminal) {
  const projectRisk = terminal?.project_risk || buildProjectRiskModel(terminal);
  const recessionProb = Number.isFinite(terminal?.recession_probability?.next_12_months)
    ? terminal.recession_probability.next_12_months
    : null;
  const capitalFlows = terminal?.capital_flows || buildCapitalFlows(terminal);
  const metrics = extractTerminalInputs(terminal);
  const weakMarketScore = Number.isFinite(terminal?.migration_index?.outbound_markets?.[0]?.score)
    ? terminal.migration_index.outbound_markets[0].score
    : null;
  const weakMarketName = terminal?.migration_index?.outbound_markets?.[0]?.market || "softer metros";

  let score = 20;
  const drivers = [];

  if (metrics.liquidity_state === "tight") {
    score += 21;
    drivers.push("liquidity is tight");
  } else if (metrics.liquidity_state === "neutral") {
    score += 11;
    drivers.push("liquidity is neutral");
  }

  if (projectRisk.score >= 60) {
    score += 16;
    drivers.push(`project risk is elevated (${projectRisk.score.toFixed(1)})`);
  }

  if (recessionProb !== null) {
    if (recessionProb >= 60) {
      score += 16;
      drivers.push(`recession probability is elevated (${recessionProb.toFixed(1)}%)`);
    } else if (recessionProb >= 45) {
      score += 8;
      drivers.push(`recession probability is rising (${recessionProb.toFixed(1)}%)`);
    }
  }

  if (weakMarketScore !== null && weakMarketScore <= 45) {
    score += 12;
    drivers.push(`${weakMarketName} is deteriorating (${weakMarketScore.toFixed(1)})`);
  }

  if (capitalFlows.headline === "Defensive") {
    score += 14;
    drivers.push("capital flows are defensive");
  } else if (capitalFlows.headline === "Supportive") {
    score -= 8;
    drivers.push("capital flows remain supportive");
  }

  const finalScore = clampScore(score);
  const state = toPressureState(finalScore);
  return {
    score: finalScore,
    state,
    drivers: drivers.slice(0, 6),
    explanation: `Lender pullback risk is ${state} due to ${drivers.slice(0, 4).join("; ")}.`,
  };
}

function buildCounterpartyQualityModel(terminal) {
  const ownerRisk = terminal?.owner_risk || buildOwnerRiskModel(terminal);
  const developerFragility = terminal?.developer_fragility || buildDeveloperFragilityModel(terminal);
  const lenderPullbackRisk = terminal?.lender_pullback_risk || buildLenderPullbackRiskModel(terminal);
  const receivablesRisk = terminal?.receivables_risk || buildReceivablesRiskModel(terminal);
  const paymentDelayRisk = terminal?.payment_delay_risk || buildPaymentDelayRiskModel(terminal);

  let score = 72;
  const drivers = [];

  if (ownerRisk.score >= 60) {
    score -= 16;
    drivers.push(`owner risk is elevated (${ownerRisk.score.toFixed(1)})`);
  }

  if (developerFragility.score >= 60) {
    score -= 15;
    drivers.push(`developer fragility is elevated (${developerFragility.score.toFixed(1)})`);
  }

  if (lenderPullbackRisk.score >= 60) {
    score -= 14;
    drivers.push(`lender pullback risk is elevated (${lenderPullbackRisk.score.toFixed(1)})`);
  }

  if (receivablesRisk.score >= 60 || paymentDelayRisk.score >= 60) {
    score -= 13;
    drivers.push("receivables and payment delay stress are elevated");
  }

  if (ownerRisk.score < 45 && developerFragility.score < 45 && lenderPullbackRisk.score < 45) {
    score += 10;
    drivers.push("sponsor and lender conditions are broadly stable");
  }

  const finalScore = clampScore(score);
  const state = toCounterpartyQualityState(finalScore);
  return {
    score: finalScore,
    state,
    drivers: drivers.slice(0, 6),
    explanation: `Counterparty quality is ${state} due to ${drivers.slice(0, 4).join("; ")}.`,
  };
}

function buildMetroConcentrationRiskModel(terminal) {
  const migrationIndex = terminal?.migration_index || {};
  const inbound = Array.isArray(migrationIndex.inbound_markets) ? migrationIndex.inbound_markets : [];
  const outbound = Array.isArray(migrationIndex.outbound_markets) ? migrationIndex.outbound_markets : [];

  const topInboundScore = Number.isFinite(inbound[0]?.score) ? inbound[0].score : null;
  const secondInboundScore = Number.isFinite(inbound[1]?.score) ? inbound[1].score : null;
  const weakestOutboundScore = Number.isFinite(outbound[0]?.score) ? outbound[0].score : null;
  const strongest = terminal?.forecast?.strongest_next_12_months?.[0]
    || (terminal?.forecast_summary?.strongest_market ? { market: terminal.forecast_summary.strongest_market, forecast_score: topInboundScore } : null);
  const weakest = terminal?.forecast?.weakest_next_12_months?.[0]
    || (terminal?.forecast_summary?.weakest_market ? { market: terminal.forecast_summary.weakest_market, forecast_score: weakestOutboundScore } : null);
  const strongestScore = Number.isFinite(strongest?.forecast_score) ? strongest.forecast_score : null;
  const weakestScore = Number.isFinite(weakest?.forecast_score) ? weakest.forecast_score : null;

  let score = 28;
  const drivers = [];

  if (strongestScore !== null && weakestScore !== null) {
    const spread = strongestScore - weakestScore;
    if (spread >= 28) {
      score += 24;
      drivers.push(`metro spread is wide (${spread.toFixed(1)} points)`);
    } else if (spread >= 18) {
      score += 14;
      drivers.push(`metro spread is elevated (${spread.toFixed(1)} points)`);
    }
  }

  if (topInboundScore !== null && secondInboundScore !== null) {
    const inboundGap = topInboundScore - secondInboundScore;
    if (inboundGap >= 12) {
      score += 18;
      drivers.push(`migration leadership is narrow (top inbound gap ${inboundGap.toFixed(1)})`);
    } else if (inboundGap >= 6) {
      score += 10;
      drivers.push(`top inbound metros are concentrated (gap ${inboundGap.toFixed(1)})`);
    }
  }

  if (weakestOutboundScore !== null && weakestOutboundScore <= 42) {
    score += 16;
    drivers.push(`weak metro cohort is deteriorating (${weakestOutboundScore.toFixed(1)})`);
  }

  if (topInboundScore !== null && topInboundScore >= 67 && weakestOutboundScore !== null && weakestOutboundScore <= 45) {
    score += 10;
    drivers.push("portfolio narrative is dependent on one strong metro lane while weak metros soften");
  }

  const finalScore = clampScore(score);
  const state = toPressureState(finalScore);
  return {
    score: finalScore,
    state,
    drivers: drivers.slice(0, 6),
    explanation: `Metro concentration risk is ${state} due to ${drivers.slice(0, 4).join("; ")}.`,
  };
}

function buildCounterpartyConcentrationRiskModel(terminal) {
  const ownerRisk = terminal?.owner_risk || buildOwnerRiskModel(terminal);
  const developerFragility = terminal?.developer_fragility || buildDeveloperFragilityModel(terminal);
  const lenderPullbackRisk = terminal?.lender_pullback_risk || buildLenderPullbackRiskModel(terminal);
  const counterpartyQuality = terminal?.counterparty_quality || buildCounterpartyQualityModel(terminal);
  const receivablesRisk = terminal?.receivables_risk || buildReceivablesRiskModel(terminal);
  const collectionsStress = terminal?.collections_stress || buildCollectionsStressModel(terminal);

  let score = 24;
  const drivers = [];

  if (ownerRisk.score >= 60) {
    score += 20;
    drivers.push(`owner risk is elevated (${ownerRisk.score.toFixed(1)})`);
  }

  if (developerFragility.score >= 60) {
    score += 18;
    drivers.push(`developer fragility is elevated (${developerFragility.score.toFixed(1)})`);
  }

  if (lenderPullbackRisk.score >= 60) {
    score += 12;
    drivers.push(`lender pullback risk is elevated (${lenderPullbackRisk.score.toFixed(1)})`);
  }

  if (counterpartyQuality.state === "weak") {
    score += 16;
    drivers.push(`counterparty quality is weak (${counterpartyQuality.score.toFixed(1)})`);
  }

  if (receivablesRisk.score >= 60 || collectionsStress.score >= 60) {
    score += 12;
    drivers.push("collections and receivables stress indicate concentration in weaker counterparties");
  }

  const finalScore = clampScore(score);
  const state = toPressureState(finalScore);
  return {
    score: finalScore,
    state,
    drivers: drivers.slice(0, 6),
    explanation: `Counterparty concentration risk is ${state} due to ${drivers.slice(0, 4).join("; ")}.`,
  };
}

function buildProjectMixExposureModel(terminal) {
  const backlogQuality = terminal?.backlog_quality || buildBacklogQualityModel(terminal);
  const projectRisk = terminal?.project_risk || buildProjectRiskModel(terminal);
  const marginPressure = terminal?.margin_pressure || buildMarginPressureModel(terminal);
  const metrics = extractTerminalInputs(terminal);
  const bidIntensity = terminal?.bid_intensity || buildBidIntensityModel(terminal);

  let score = 22;
  const drivers = [];

  if (backlogQuality.state === "weak") {
    score += 22;
    drivers.push(`backlog quality is weak (${backlogQuality.score.toFixed(1)})`);
  } else if (backlogQuality.state === "mixed") {
    score += 12;
    drivers.push(`backlog quality is mixed (${backlogQuality.score.toFixed(1)})`);
  }

  if (projectRisk.score >= 60) {
    score += 22;
    drivers.push(`project risk is elevated (${projectRisk.score.toFixed(1)})`);
  }

  if (metrics.commercial_pct_change !== null && metrics.housing_pct_change !== null
      && metrics.commercial_pct_change < 0 && metrics.housing_pct_change < 0) {
    score += 18;
    drivers.push(`commercial and housing demand are both soft (${metrics.commercial_pct_change.toFixed(2)}%, ${metrics.housing_pct_change.toFixed(2)}%)`);
  }

  if (metrics.starts_trend_pct !== null && metrics.permits_trend_pct !== null
      && metrics.starts_trend_pct - metrics.permits_trend_pct >= 1.5) {
    score += 10;
    drivers.push("starts are running ahead of permits, implying speculative conversion skew");
  }

  if (bidIntensity.score >= 62 && marginPressure.score >= 60) {
    score += 8;
    drivers.push("high bid intensity with margin pressure signals weaker-conversion mix risk");
  }

  const finalScore = clampScore(score);
  const state = toPressureState(finalScore);
  return {
    score: finalScore,
    state,
    drivers: drivers.slice(0, 6),
    explanation: `Project mix exposure is ${state} due to ${drivers.slice(0, 4).join("; ")}.`,
  };
}

function buildPortfolioRiskModel(terminal) {
  const metroConcentrationRisk = terminal?.metro_concentration_risk || buildMetroConcentrationRiskModel(terminal);
  const counterpartyConcentrationRisk = terminal?.counterparty_concentration_risk || buildCounterpartyConcentrationRiskModel(terminal);
  const projectMixExposure = terminal?.project_mix_exposure || buildProjectMixExposureModel(terminal);
  const marginPressure = terminal?.margin_pressure || buildMarginPressureModel(terminal);
  const collectionsStress = terminal?.collections_stress || buildCollectionsStressModel(terminal);
  const projectRisk = terminal?.project_risk || buildProjectRiskModel(terminal);

  let score = metroConcentrationRisk.score * 0.32
    + counterpartyConcentrationRisk.score * 0.3
    + projectMixExposure.score * 0.28
    + marginPressure.score * 0.05
    + collectionsStress.score * 0.03
    + projectRisk.score * 0.02;
  const drivers = [
    `metro concentration risk ${metroConcentrationRisk.score.toFixed(1)}`,
    `counterparty concentration risk ${counterpartyConcentrationRisk.score.toFixed(1)}`,
    `project mix exposure ${projectMixExposure.score.toFixed(1)}`,
  ];

  if (marginPressure.score >= 60) drivers.push(`margin pressure is elevated (${marginPressure.score.toFixed(1)})`);
  if (collectionsStress.score >= 60) drivers.push(`collections stress is elevated (${collectionsStress.score.toFixed(1)})`);
  if (projectRisk.score >= 60) drivers.push(`project risk is elevated (${projectRisk.score.toFixed(1)})`);

  const finalScore = clampScore(score);
  const state = toPressureState(finalScore);
  return {
    score: finalScore,
    state,
    drivers: drivers.slice(0, 6),
    explanation: `Portfolio risk is ${state} due to ${drivers.slice(0, 4).join("; ")}.`,
  };
}

function buildMaterialsShockModel(terminal) {
  const metrics = extractTerminalInputs(terminal);
  const inflationTrend = Number.isFinite(terminal?.risk?.inflation_trend_pct) ? terminal.risk.inflation_trend_pct : null;
  const manufacturers = Number.isFinite(terminal?.power_index?.manufacturers?.score) ? terminal.power_index.manufacturers.score : null;
  const distributors = Number.isFinite(terminal?.power_index?.distributors?.score) ? terminal.power_index.distributors.score : null;
  const startsTrend = Number.isFinite(metrics.starts_trend_pct) ? metrics.starts_trend_pct : null;

  let score = 30;
  const drivers = [];

  if (inflationTrend !== null) {
    if (inflationTrend >= 3.5) {
      score += 22;
      drivers.push(`inflation trend is elevated (${inflationTrend.toFixed(2)}%)`);
    } else if (inflationTrend >= 2.5) {
      score += 12;
      drivers.push(`inflation trend is above target (${inflationTrend.toFixed(2)}%)`);
    } else {
      score -= 6;
      drivers.push(`inflation trend is comparatively contained (${inflationTrend.toFixed(2)}%)`);
    }
  } else {
    drivers.push("inflation trend proxy unavailable; neutral baseline applied");
  }

  if (manufacturers !== null && distributors !== null) {
    const supplyPower = (manufacturers + distributors) / 2;
    if (supplyPower >= 60) {
      score += 14;
      drivers.push(`upstream pricing power is strong (${supplyPower.toFixed(1)})`);
    } else if (supplyPower < 45) {
      score -= 8;
      drivers.push(`upstream pricing power is weak (${supplyPower.toFixed(1)})`);
    }
  }

  if (metrics.liquidity_state === "tight") {
    score += 10;
    drivers.push("tight liquidity raises working-capital and inventory carrying pressure");
  }

  if (startsTrend !== null && startsTrend > 1.5) {
    score += 8;
    drivers.push(`starts trend is positive (${startsTrend.toFixed(2)}%), supporting input demand`);
  } else if (startsTrend !== null && startsTrend < -1.5) {
    score -= 6;
    drivers.push(`starts trend is soft (${startsTrend.toFixed(2)}%), easing near-term materials pull`);
  }

  const finalScore = clampScore(score);
  const state = toPressureState(finalScore);
  return {
    score: finalScore,
    state,
    drivers: drivers.slice(0, 5),
    explanation: `Materials inflation pressure is ${state} due to ${drivers.slice(0, 3).join("; ")}.`,
  };
}

function buildLaborShockModel(terminal) {
  const metrics = extractTerminalInputs(terminal);
  const subcontractors = Number.isFinite(terminal?.power_index?.subcontractors?.score) ? terminal.power_index.subcontractors.score : null;
  const constructionIndex = Number.isFinite(metrics.construction_index) ? metrics.construction_index : null;
  const permitsTrend = Number.isFinite(metrics.permits_trend_pct) ? metrics.permits_trend_pct : null;

  let score = 32;
  const drivers = [];

  if (constructionIndex !== null) {
    if (constructionIndex >= 57) {
      score += 15;
      drivers.push(`construction index is firm (${constructionIndex.toFixed(1)})`);
    } else if (constructionIndex < 46) {
      score -= 10;
      drivers.push(`construction index is weak (${constructionIndex.toFixed(1)})`);
    }
  }

  if (subcontractors !== null) {
    if (subcontractors >= 58) {
      score += 18;
      drivers.push(`subcontractor leverage is elevated (${subcontractors.toFixed(1)})`);
    } else if (subcontractors < 45) {
      score -= 8;
      drivers.push(`subcontractor leverage is soft (${subcontractors.toFixed(1)})`);
    }
  }

  if (metrics.liquidity_state === "tight") {
    score += 8;
    drivers.push("tight liquidity constrains payroll flexibility and hiring buffers");
  }

  if (permitsTrend !== null && permitsTrend > 1) {
    score += 6;
    drivers.push(`permits trend is positive (${permitsTrend.toFixed(2)}%), indicating future crew demand`);
  } else if (permitsTrend !== null && permitsTrend < -1) {
    score -= 5;
    drivers.push(`permits trend is soft (${permitsTrend.toFixed(2)}%), reducing labor demand pressure`);
  }

  const finalScore = clampScore(score);
  const state = toPressureState(finalScore);
  return {
    score: finalScore,
    state,
    drivers: drivers.slice(0, 5),
    explanation: `Labor tightness pressure is ${state} due to ${drivers.slice(0, 3).join("; ")}.`,
  };
}

function buildMarginPressureModel(terminal) {
  const materials = terminal.materials_shock || buildMaterialsShockModel(terminal);
  const labor = terminal.labor_shock || buildLaborShockModel(terminal);
  const metrics = extractTerminalInputs(terminal);
  const subs = Number.isFinite(terminal?.power_index?.subcontractors?.score) ? terminal.power_index.subcontractors.score : null;
  const gc = Number.isFinite(terminal?.power_index?.general_contractors?.score) ? terminal.power_index.general_contractors.score : null;

  let score = materials.score * 0.5 + labor.score * 0.5;
  const drivers = [
    `materials shock score ${materials.score.toFixed(1)}`,
    `labor shock score ${labor.score.toFixed(1)}`,
  ];

  if (metrics.commercial_pct_change !== null && metrics.housing_pct_change !== null
      && metrics.commercial_pct_change >= 0 && metrics.housing_pct_change >= 0) {
    score += 8;
    drivers.push("demand remains stable while costs are rising, squeezing conversion");
  }

  if (metrics.risk_score !== null && metrics.risk_score >= 60) {
    score += 8;
    drivers.push(`macro risk is elevated (${metrics.risk_score.toFixed(1)})`);
  }

  if (subs !== null && gc !== null && subs > gc) {
    score += 6;
    drivers.push("subcontractor leverage exceeds GC leverage");
  }

  if (metrics.liquidity_state === "tight") {
    score += 7;
    drivers.push("tight liquidity limits repricing flexibility");
  }

  const finalScore = clampScore(score);
  const state = toPressureState(finalScore);
  return {
    score: finalScore,
    state,
    drivers: drivers.slice(0, 6),
    explanation: `Combined margin stress is ${state} from ${drivers.slice(0, 4).join("; ")}.`,
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
  const inboundSource = forecast?.strongest_next_12_months || heatmap?.hottest_markets || [];
  const outboundSource = forecast?.weakest_next_12_months || heatmap?.weakest_markets || [];
  const inboundUniverse = filterMetroOnlyWhenAvailable(inboundSource);
  const outboundUniverse = filterMetroOnlyWhenAvailable(outboundSource);

  const inbound_markets = inboundUniverse
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
  const outbound_markets = outboundUniverse
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
  const signal = !isSubsectionFailure(terminal?.signal) && typeof terminal?.signal?.signal === "string"
    ? terminal.signal.signal
    : "unknown";
  const regime = !isSubsectionFailure(terminal?.regime) && typeof terminal?.regime?.regime === "string"
    ? terminal.regime.regime
    : "unknown";
  const risk = !isSubsectionFailure(terminal?.risk) && typeof terminal?.risk?.risk_level === "string"
    ? terminal.risk.risk_level
    : "unknown";

  return {
    signal,
    regime,
    liquidity: metrics.liquidity_state || "unknown",
    risk,
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
  terminal.materials_shock = buildMaterialsShockModel(terminal);
  terminal.materials_shock_summary = terminal.materials_shock.explanation;
  terminal.labor_shock = buildLaborShockModel(terminal);
  terminal.labor_shock_summary = terminal.labor_shock.explanation;
  terminal.margin_pressure = buildMarginPressureModel(terminal);
  terminal.margin_pressure_summary = terminal.margin_pressure.explanation;
  terminal.backlog_quality = buildBacklogQualityModel(terminal);
  terminal.backlog_quality_summary = terminal.backlog_quality.explanation;
  terminal.bid_intensity = buildBidIntensityModel(terminal);
  terminal.bid_intensity_summary = terminal.bid_intensity.explanation;
  terminal.project_risk = buildProjectRiskModel(terminal);
  terminal.project_risk_summary = terminal.project_risk.explanation;
  terminal.receivables_risk = buildReceivablesRiskModel(terminal);
  terminal.receivables_risk_summary = terminal.receivables_risk.explanation;
  terminal.payment_delay_risk = buildPaymentDelayRiskModel(terminal);
  terminal.payment_delay_risk_summary = terminal.payment_delay_risk.explanation;
  terminal.collections_stress = buildCollectionsStressModel(terminal);
  terminal.collections_stress_summary = terminal.collections_stress.explanation;
  terminal.owner_risk = buildOwnerRiskModel(terminal);
  terminal.owner_risk_summary = terminal.owner_risk.explanation;
  terminal.developer_fragility = buildDeveloperFragilityModel(terminal);
  terminal.developer_fragility_summary = terminal.developer_fragility.explanation;
  terminal.lender_pullback_risk = buildLenderPullbackRiskModel(terminal);
  terminal.lender_pullback_risk_summary = terminal.lender_pullback_risk.explanation;
  terminal.counterparty_quality = buildCounterpartyQualityModel(terminal);
  terminal.counterparty_quality_summary = terminal.counterparty_quality.explanation;
  terminal.metro_concentration_risk = buildMetroConcentrationRiskModel(terminal);
  terminal.metro_concentration_risk_summary = terminal.metro_concentration_risk.explanation;
  terminal.counterparty_concentration_risk = buildCounterpartyConcentrationRiskModel(terminal);
  terminal.counterparty_concentration_risk_summary = terminal.counterparty_concentration_risk.explanation;
  terminal.project_mix_exposure = buildProjectMixExposureModel(terminal);
  terminal.project_mix_exposure_summary = terminal.project_mix_exposure.explanation;
  terminal.portfolio_risk = buildPortfolioRiskModel(terminal);
  terminal.portfolio_risk_summary = terminal.portfolio_risk.explanation;

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
    terminal.forecast = forecast;
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

  terminal.bid_intensity = buildBidIntensityModel(terminal);
  terminal.bid_intensity_summary = terminal.bid_intensity.explanation;
  terminal.project_risk = buildProjectRiskModel(terminal);
  terminal.project_risk_summary = terminal.project_risk.explanation;
  terminal.receivables_risk = buildReceivablesRiskModel(terminal);
  terminal.receivables_risk_summary = terminal.receivables_risk.explanation;
  terminal.payment_delay_risk = buildPaymentDelayRiskModel(terminal);
  terminal.payment_delay_risk_summary = terminal.payment_delay_risk.explanation;
  terminal.collections_stress = buildCollectionsStressModel(terminal);
  terminal.collections_stress_summary = terminal.collections_stress.explanation;
  terminal.owner_risk = buildOwnerRiskModel(terminal);
  terminal.owner_risk_summary = terminal.owner_risk.explanation;
  terminal.developer_fragility = buildDeveloperFragilityModel(terminal);
  terminal.developer_fragility_summary = terminal.developer_fragility.explanation;
  terminal.lender_pullback_risk = buildLenderPullbackRiskModel(terminal);
  terminal.lender_pullback_risk_summary = terminal.lender_pullback_risk.explanation;
  terminal.counterparty_quality = buildCounterpartyQualityModel(terminal);
  terminal.counterparty_quality_summary = terminal.counterparty_quality.explanation;
  terminal.metro_concentration_risk = buildMetroConcentrationRiskModel(terminal);
  terminal.metro_concentration_risk_summary = terminal.metro_concentration_risk.explanation;
  terminal.counterparty_concentration_risk = buildCounterpartyConcentrationRiskModel(terminal);
  terminal.counterparty_concentration_risk_summary = terminal.counterparty_concentration_risk.explanation;
  terminal.project_mix_exposure = buildProjectMixExposureModel(terminal);
  terminal.project_mix_exposure_summary = terminal.project_mix_exposure.explanation;
  terminal.portfolio_risk = buildPortfolioRiskModel(terminal);
  terminal.portfolio_risk_summary = terminal.portfolio_risk.explanation;

  if (terminal.project_risk.state === "severe" || terminal.project_risk.state === "elevated" || terminal.collections_stress.state === "elevated" || terminal.collections_stress.state === "severe" || terminal.owner_risk.state === "elevated" || terminal.owner_risk.state === "severe" || terminal.developer_fragility.state === "elevated" || terminal.developer_fragility.state === "severe" || terminal.lender_pullback_risk.state === "elevated" || terminal.lender_pullback_risk.state === "severe" || terminal.counterparty_quality.state === "weak" || terminal.metro_concentration_risk.state === "elevated" || terminal.metro_concentration_risk.state === "severe" || terminal.counterparty_concentration_risk.state === "elevated" || terminal.counterparty_concentration_risk.state === "severe" || terminal.project_mix_exposure.state === "elevated" || terminal.project_mix_exposure.state === "severe" || terminal.portfolio_risk.state === "elevated" || terminal.portfolio_risk.state === "severe") {
    terminal.operator_actions.gc = "Diversify metro exposure, tighten customer selection, and stress-test backlog conversion by metro and sponsor bucket.";
    terminal.operator_actions.subcontractor = "Monitor aging aggressively, reduce concentration in weaker sponsors, and avoid thin-bid exposure in soft metros.";
    terminal.operator_actions.developer = "Rebalance toward higher-certainty project mix, sequence starts by financing certainty, and defer marginal speculative starts.";
    terminal.operator_actions.lender = "Avoid over-allocating to one hot market and tighten covenants on fragile counterparties and soft-metro exposure.";
    terminal.operator_actions.supplier = "Trim exposure to fragile counterparties and soft metros while aligning inventory to higher-certainty backlog cohorts.";
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

function deterministicMetroScore(entry, nationalBaseline = 50) {
  const basis = String(entry?.cbsa ?? entry?.id ?? entry?.label ?? "market");
  let hash = 0;
  for (let i = 0; i < basis.length; i += 1) {
    hash = (hash * 31 + basis.charCodeAt(i)) % 997;
  }
  const offset = (hash % 17) - 8;
  return Math.max(20, Math.min(85, Math.round(nationalBaseline + offset)));
}

function fallbackPressureFields(score) {
  const zone = score >= 62 ? "Hot" : score <= 42 ? "Compression" : "Balanced";
  const momentumBand = score >= 58 ? "Accelerating" : score <= 45 ? "Decelerating" : "Stable";
  const signal = score >= 62 ? "🔴" : score <= 42 ? "🟢" : "🟡";
  return { zone, momentumBand, signal };
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
    return `${market} ranks on the stronger side because ${because}, with conditions that still support relative outperformance over the next 12 months.`;
  }
  return `${market} ranks on the weaker side because ${because}, with macro pressure increasing downside risk over the next 12 months.`;
}

function toRankPositionExplanation(market, rankDirection, drivers) {
  return toForecastExplanation(market, rankDirection, drivers);
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
  const rankingUniverse = filterMetroOnlyWhenAvailable(forecasted);
  const strongest = [...rankingUniverse]
    .sort((a, b) => (b.forecast_score - a.forecast_score) || a.market.localeCompare(b.market))
    .slice(0, Math.min(10, forecasted.length))
    .map((item) => ({
      ...item,
      direction: "strengthening",
      explanation: toRankPositionExplanation(item.market, "strengthening", item.drivers),
    }));
  const weakest = [...rankingUniverse]
    .sort((a, b) => (a.forecast_score - b.forecast_score) || a.market.localeCompare(b.market))
    .slice(0, Math.min(10, forecasted.length))
    .map((item) => ({
      ...item,
      direction: "softening",
      explanation: toRankPositionExplanation(item.market, "softening", item.drivers),
    }));

  return {
    strongest_next_12_months: strongest,
    weakest_next_12_months: weakest,
    summary: buildForecastSummary(strongest, weakest),
  };
}

function scoreMarketPayload(payload, fallbackMarketName, marketEntry = null, nationalBaseline = null) {
  const market = payload?.meta?.region?.name || fallbackMarketName;
  const explicitScore = payload?.indices?.pressure_index?.value;
  const isNationalEntry = marketEntry?.type === "national" || marketEntry?.id === "national";
  const baseline = Number.isFinite(nationalBaseline) ? nationalBaseline : 50;
  const score = Number.isFinite(explicitScore)
    ? explicitScore
    : isNationalEntry
      ? baseline
      : deterministicMetroScore(marketEntry, baseline);
  if (!Number.isFinite(score)) return null;

  const cycleState = payload?.regime?.cycle_state;
  const zone = payload?.indices?.pressure_index?.zone;
  const momentumBand = payload?.indices?.pressure_index?.momentum_band;
  const signal = payload?.indices?.pressure_index?.risk_state;
  const fallbackPressure = fallbackPressureFields(score);

  // Deterministic ranking strategy:
  // 1) Primary sort by pressure_index.value descending (higher = hotter pressure).
  // 2) Tiebreak by market name ascending for stable output.
  return {
    market,
    market_id: typeof marketEntry?.id === "string" ? marketEntry.id : null,
    market_type: typeof marketEntry?.type === "string" ? marketEntry.type : null,
    score,
    regime: typeof cycleState === "string" && cycleState.length > 0 ? cycleState : "unknown",
    signal: typeof signal === "string" && signal.length > 0 ? signal : fallbackPressure.signal,
    zone: typeof zone === "string" && zone.length > 0 ? zone : fallbackPressure.zone,
    momentumBand: typeof momentumBand === "string" && momentumBand.length > 0 ? momentumBand : fallbackPressure.momentumBand,
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


function isNationalMarket(scoredMarket) {
  if (scoredMarket?.market_type === "national" || scoredMarket?.market_id === "national") {
    return true;
  }

  const normalized = String(scoredMarket?.market || "").trim().toLowerCase();
  return normalized === "united states" || normalized === "national";
}

function filterMetroOnlyWhenAvailable(markets) {
  if (!Array.isArray(markets) || markets.length === 0) return [];
  const hasMetro = markets.some((market) => !isNationalMarket(market));
  return hasMetro ? markets.filter((market) => !isNationalMarket(market)) : markets;
}

function buildRadarFromMarkets(scoredMarkets) {
  if (!Array.isArray(scoredMarkets) || scoredMarkets.length === 0) {
    return subsectionError(
      "MARKETS_DATA_UNUSABLE",
      "No market signal files contained a numeric indices.pressure_index.value for deterministic ranking"
    );
  }

  const hasMetro = scoredMarkets.some((market) => !isNationalMarket(market));
  const rankingUniverse = hasMetro
    ? scoredMarkets.filter((market) => !isNationalMarket(market))
    : scoredMarkets;

  if (rankingUniverse.length === 0) {
    return subsectionError(
      "MARKETS_DATA_UNUSABLE",
      "No market signal files contained a numeric indices.pressure_index.value for deterministic ranking"
    );
  }

  const rankedDesc = [...rankingUniverse].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.market.localeCompare(b.market);
  });

  const rankedAsc = [...rankingUniverse].sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    return a.market.localeCompare(b.market);
  });

  const topCount = Math.min(3, rankingUniverse.length);

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
    return subsectionError("ASSETS_NOT_CONFIGURED", "Static asset binding is not configured; cannot read markets/*.json files");
  }

  const base = "http://assets";
  const indexPathValidation = validateAssetRootRelativePath(MARKETS_INDEX_ASSET_PATH, "markets index path");
  if (!indexPathValidation.ok) {
    return subsectionError("MARKETS_INDEX_PATH_INVALID", indexPathValidation.reason, { path: indexPathValidation.normalizedPath || MARKETS_INDEX_ASSET_PATH });
  }

  const marketsIndexPath = indexPathValidation.normalizedPath;
  const marketsIndexRes = await env.ASSETS.fetch(`${base}/${marketsIndexPath}`);
  if (!marketsIndexRes.ok) {
    return subsectionError("MARKETS_INDEX_MISSING", `Unable to read ${MARKETS_INDEX_ASSET_PATH}`, { status: marketsIndexRes.status });
  }

  const marketsIndex = await marketsIndexRes.json();
  const entries = Array.isArray(marketsIndex?.markets) ? marketsIndex.markets : [];
  if (entries.length === 0) {
    return subsectionError("MARKETS_INDEX_EMPTY", `No market entries found in ${MARKETS_INDEX_ASSET_PATH}`);
  }

  const scoredMarkets = [];
  let nationalBaselineScore = null;

  const nationalEntry = entries.find((entry) => entry?.type === "national" || entry?.id === "national");
  if (nationalEntry?.path) {
    const nationalPathValidation = validateAssetRootRelativePath(nationalEntry.path, "national market path");
    if (nationalPathValidation.ok) {
      const nationalRes = await env.ASSETS.fetch(`${base}/${nationalPathValidation.normalizedPath}`);
      if (nationalRes.ok) {
        const nationalPayload = await nationalRes.json();
        const candidate = nationalPayload?.indices?.pressure_index?.value;
        if (Number.isFinite(candidate)) {
          nationalBaselineScore = candidate;
        }
      }
    }
  }

  for (const entry of entries) {
    const marketPath = entry?.path;
    if (typeof marketPath !== "string" || marketPath.length === 0) continue;
    const marketPathValidation = validateAssetRootRelativePath(marketPath, `market path for ${entry?.id || entry?.label || "unknown"}`);
    if (!marketPathValidation.ok) continue;

    const normalizedMarketPath = marketPathValidation.normalizedPath;
    const res = await env.ASSETS.fetch(`${base}/${normalizedMarketPath}`);
    if (!res.ok) continue;
    const payload = await res.json();
    const scored = scoreMarketPayload(payload, entry?.label || entry?.id || "unknown", entry, nationalBaselineScore);
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

export async function handleConstructionMaterialsShock(request, env) {
  try {
    const terminal = await buildTerminalPayload(request, env);
    return ok(env, { materials_shock: terminal.materials_shock });
  } catch (e) {
    return error(env, 500, "MATERIALS_SHOCK_FAILED", "Unable to build construction materials shock model", {
      message: e?.message || String(e),
    });
  }
}

export async function handleConstructionLaborShock(request, env) {
  try {
    const terminal = await buildTerminalPayload(request, env);
    return ok(env, { labor_shock: terminal.labor_shock });
  } catch (e) {
    return error(env, 500, "LABOR_SHOCK_FAILED", "Unable to build construction labor shock model", {
      message: e?.message || String(e),
    });
  }
}

export async function handleConstructionMarginPressure(request, env) {
  try {
    const terminal = await buildTerminalPayload(request, env);
    return ok(env, { margin_pressure: terminal.margin_pressure });
  } catch (e) {
    return error(env, 500, "MARGIN_PRESSURE_FAILED", "Unable to build construction margin pressure model", {
      message: e?.message || String(e),
    });
  }
}

export async function handleConstructionBidIntensity(request, env) {
  try {
    const terminal = await buildTerminalPayload(request, env);
    return ok(env, { bid_intensity: terminal.bid_intensity });
  } catch (e) {
    return error(env, 500, "BID_INTENSITY_FAILED", "Unable to build construction bid intensity model", {
      message: e?.message || String(e),
    });
  }
}

export async function handleConstructionBacklogQuality(request, env) {
  try {
    const terminal = await buildTerminalPayload(request, env);
    return ok(env, { backlog_quality: terminal.backlog_quality });
  } catch (e) {
    return error(env, 500, "BACKLOG_QUALITY_FAILED", "Unable to build construction backlog quality model", {
      message: e?.message || String(e),
    });
  }
}

export async function handleConstructionProjectRisk(request, env) {
  try {
    const terminal = await buildTerminalPayload(request, env);
    return ok(env, { project_risk: terminal.project_risk });
  } catch (e) {
    return error(env, 500, "PROJECT_RISK_FAILED", "Unable to build construction project risk model", {
      message: e?.message || String(e),
    });
  }
}
export async function handleConstructionReceivablesRisk(request, env) {
  try {
    const terminal = await buildTerminalPayload(request, env);
    return ok(env, { receivables_risk: terminal.receivables_risk });
  } catch (e) {
    return error(env, 500, "RECEIVABLES_RISK_FAILED", "Unable to build construction receivables risk model", {
      message: e?.message || String(e),
    });
  }
}

export async function handleConstructionPaymentDelayRisk(request, env) {
  try {
    const terminal = await buildTerminalPayload(request, env);
    return ok(env, { payment_delay_risk: terminal.payment_delay_risk });
  } catch (e) {
    return error(env, 500, "PAYMENT_DELAY_RISK_FAILED", "Unable to build construction payment delay risk model", {
      message: e?.message || String(e),
    });
  }
}

export async function handleConstructionCollectionsStress(request, env) {
  try {
    const terminal = await buildTerminalPayload(request, env);
    return ok(env, { collections_stress: terminal.collections_stress });
  } catch (e) {
    return error(env, 500, "COLLECTIONS_STRESS_FAILED", "Unable to build construction collections stress model", {
      message: e?.message || String(e),
    });
  }
}
export async function handleConstructionOwnerRisk(request, env) {
  try {
    const terminal = await buildTerminalPayload(request, env);
    return ok(env, { owner_risk: terminal.owner_risk });
  } catch (e) {
    return error(env, 500, "OWNER_RISK_FAILED", "Unable to build construction owner risk model", {
      message: e?.message || String(e),
    });
  }
}

export async function handleConstructionDeveloperFragility(request, env) {
  try {
    const terminal = await buildTerminalPayload(request, env);
    return ok(env, { developer_fragility: terminal.developer_fragility });
  } catch (e) {
    return error(env, 500, "DEVELOPER_FRAGILITY_FAILED", "Unable to build construction developer fragility model", {
      message: e?.message || String(e),
    });
  }
}

export async function handleConstructionLenderPullbackRisk(request, env) {
  try {
    const terminal = await buildTerminalPayload(request, env);
    return ok(env, { lender_pullback_risk: terminal.lender_pullback_risk });
  } catch (e) {
    return error(env, 500, "LENDER_PULLBACK_RISK_FAILED", "Unable to build construction lender pullback risk model", {
      message: e?.message || String(e),
    });
  }
}

export async function handleConstructionCounterpartyQuality(request, env) {
  try {
    const terminal = await buildTerminalPayload(request, env);
    return ok(env, { counterparty_quality: terminal.counterparty_quality });
  } catch (e) {
    return error(env, 500, "COUNTERPARTY_QUALITY_FAILED", "Unable to build construction counterparty quality model", {
      message: e?.message || String(e),
    });
  }
}

export async function handleConstructionMetroConcentrationRisk(request, env) {
  try {
    const terminal = await buildTerminalPayload(request, env);
    return ok(env, { metro_concentration_risk: terminal.metro_concentration_risk });
  } catch (e) {
    return error(env, 500, "METRO_CONCENTRATION_RISK_FAILED", "Unable to build construction metro concentration risk model", {
      message: e?.message || String(e),
    });
  }
}

export async function handleConstructionCounterpartyConcentrationRisk(request, env) {
  try {
    const terminal = await buildTerminalPayload(request, env);
    return ok(env, { counterparty_concentration_risk: terminal.counterparty_concentration_risk });
  } catch (e) {
    return error(env, 500, "COUNTERPARTY_CONCENTRATION_RISK_FAILED", "Unable to build construction counterparty concentration risk model", {
      message: e?.message || String(e),
    });
  }
}

export async function handleConstructionProjectMixExposure(request, env) {
  try {
    const terminal = await buildTerminalPayload(request, env);
    return ok(env, { project_mix_exposure: terminal.project_mix_exposure });
  } catch (e) {
    return error(env, 500, "PROJECT_MIX_EXPOSURE_FAILED", "Unable to build construction project mix exposure model", {
      message: e?.message || String(e),
    });
  }
}

export async function handleConstructionPortfolioRisk(request, env) {
  try {
    const terminal = await buildTerminalPayload(request, env);
    return ok(env, { portfolio_risk: terminal.portfolio_risk });
  } catch (e) {
    return error(env, 500, "PORTFOLIO_RISK_FAILED", "Unable to build construction portfolio risk model", {
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


export const PORTFOLIO_LAYER_ENDPOINTS = [
  "/construction/owner-risk",
  "/construction/developer-fragility",
  "/construction/lender-pullback-risk",
  "/construction/counterparty-quality",
  "/construction/metro-concentration-risk",
  "/construction/counterparty-concentration-risk",
  "/construction/project-mix-exposure",
  "/construction/portfolio-risk",
];

export const PORTFOLIO_LAYER_ROUTE_HANDLERS = {
  "/construction/owner-risk": handleConstructionOwnerRisk,
  "/construction/developer-fragility": handleConstructionDeveloperFragility,
  "/construction/lender-pullback-risk": handleConstructionLenderPullbackRisk,
  "/construction/counterparty-quality": handleConstructionCounterpartyQuality,
  "/construction/metro-concentration-risk": handleConstructionMetroConcentrationRisk,
  "/construction/counterparty-concentration-risk": handleConstructionCounterpartyConcentrationRisk,
  "/construction/project-mix-exposure": handleConstructionProjectMixExposure,
  "/construction/portfolio-risk": handleConstructionPortfolioRisk,
};
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
    buildBidIntensityModel,
    buildBacklogQualityModel,
    buildProjectRiskModel,
    buildReceivablesRiskModel,
    buildPaymentDelayRiskModel,
    buildCollectionsStressModel,
    buildMetroConcentrationRiskModel,
    buildCounterpartyConcentrationRiskModel,
    buildProjectMixExposureModel,
    buildPortfolioRiskModel,
  };
}
