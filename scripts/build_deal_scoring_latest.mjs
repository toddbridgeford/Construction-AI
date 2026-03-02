import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const MODEL_PATH = path.join(ROOT, process.env.MODEL_PATH || "framework/deal_scoring_engine_v1.json");
const DEALS_PATH = path.join(ROOT, process.env.DEALS_PATH || "config/deal_opportunities_sample.json");
const CONTRACTORS_PATH = path.join(ROOT, process.env.CONTRACTORS_PATH || "config/contractors_registry.json");
const BIDS_PATH = path.join(ROOT, process.env.BIDS_PATH || "config/historical_bids.json");
const OUT_PATH = path.join(ROOT, process.env.OUT_PATH || "deal_scoring_latest.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function clamp(value, min = 0, max = 100) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function weightedAverage(entries) {
  const norm = entries.filter((entry) => Number.isFinite(entry?.value) && Number.isFinite(entry?.weight) && entry.weight > 0);
  if (norm.length === 0) return 0;
  const totalWeight = norm.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) return 0;
  const numerator = norm.reduce((sum, entry) => sum + entry.value * entry.weight, 0);
  return numerator / totalWeight;
}

function stalenessFactor(months) {
  const m = toNumber(months, 999);
  if (m <= 12) return 1.0;
  if (m <= 24) return 0.85;
  return 0.65;
}

function deriveRelationshipScore(deal, model) {
  const edges = Array.isArray(deal?.relationship_graph?.edges) ? deal.relationship_graph.edges : [];
  const edgeWeights = model.relationship_graph?.edge_weight_defaults || {};

  const scoredEdges = edges.map((edge) => {
    const baseWeight = toNumber(edgeWeights[edge.relationship_type], 0);
    const strength = clamp(edge.strength, 0, 100);
    const freshness = stalenessFactor(edge.last_active_months);
    return {
      value: strength * freshness,
      weight: baseWeight
    };
  });

  return clamp(weightedAverage(scoredEdges), 0, 100);
}

function deriveSubcontractorHealthAndRisk(deal, model) {
  const capacity = deal?.subcontractor_capacity || {};
  const tradeWeights = model?.subcontractor_capacity_risk?.trade_weights || {};
  const healthyMax = toNumber(model?.subcontractor_capacity_risk?.healthy_utilization_pct_max, 78);
  const watchMax = toNumber(model?.subcontractor_capacity_risk?.watch_utilization_pct_max, 88);
  const criticalMin = toNumber(model?.subcontractor_capacity_risk?.critical_utilization_pct_min, 95);

  const tradeRisks = Object.entries(tradeWeights).map(([trade, weight]) => {
    const utilization = clamp(capacity[trade], 0, 100);

    let risk;
    if (utilization <= healthyMax) {
      risk = clamp((utilization / healthyMax) * 35, 0, 35);
    } else if (utilization <= watchMax) {
      const span = Math.max(1, watchMax - healthyMax);
      risk = 35 + ((utilization - healthyMax) / span) * 35;
    } else if (utilization < criticalMin) {
      const span = Math.max(1, criticalMin - watchMax);
      risk = 70 + ((utilization - watchMax) / span) * 20;
    } else {
      risk = 100;
    }

    return {
      trade,
      utilization,
      weight: toNumber(weight, 0),
      risk: clamp(risk)
    };
  });

  const riskScore = clamp(weightedAverage(tradeRisks.map((x) => ({ value: x.risk, weight: x.weight }))));
  const healthScore = clamp(100 - riskScore);

  return {
    healthScore,
    riskScore,
    tradeRisks
  };
}

function deriveStrategicFit(deal, contractor, historicalBids) {
  const projectTypeFit = contractor?.project_types?.includes(deal.project_type) ? 100 : 55;
  const regionMatch = historicalBids.find(
    (row) => row?.contractor_id === deal.contractor_id && row?.project_type === deal.project_type && row?.region === deal.region
  );

  const contractorTypeHistory = historicalBids.find(
    (row) => row?.contractor_id === deal.contractor_id && row?.project_type === deal.project_type
  );

  const winRate = regionMatch
    ? toNumber(regionMatch.wins, 0) / Math.max(1, toNumber(regionMatch.bids_submitted, 0))
    : contractorTypeHistory
      ? toNumber(contractorTypeHistory.wins, 0) / Math.max(1, toNumber(contractorTypeHistory.bids_submitted, 0))
      : 0.22;

  const historyWinScore = clamp(winRate * 100);
  const publicSectorBoost = contractor?.public_sector_experience ? 8 : 0;

  return clamp(projectTypeFit * 0.45 + historyWinScore * 0.45 + publicSectorBoost);
}

function deriveMarginPotential(marginPct) {
  const m = toNumber(marginPct, 0);
  if (m <= 4) return 20;
  if (m >= 14) return 95;
  return clamp(20 + ((m - 4) / 10) * 75);
}

function deriveRiskPenalty(riskFlags, bidDueDays) {
  const flags = riskFlags || {};
  const riskComposite = weightedAverage([
    { value: clamp(flags.design_uncertainty, 0, 100), weight: 0.35 },
    { value: clamp(flags.geotech_uncertainty, 0, 100), weight: 0.25 },
    { value: clamp(flags.owner_change_order_risk, 0, 100), weight: 0.40 }
  ]);

  const schedulePenalty = bidDueDays < 14 ? 14 : bidDueDays < 21 ? 7 : 0;
  return clamp(riskComposite + schedulePenalty);
}

function bandForScore(score, model) {
  const bands = Array.isArray(model?.decision_engine?.bands) ? model.decision_engine.bands : [];
  return bands.find((band) => score >= toNumber(band.score_min, 0) && score <= toNumber(band.score_max, 100)) || null;
}

function hardStopTriggered(score, relationshipScore, subcontractorRisk, model) {
  const autoNoBid = model?.decision_engine?.auto_no_bid_if || {};
  return (
    score <= toNumber(autoNoBid.deal_score_lte, 45) ||
    subcontractorRisk >= toNumber(autoNoBid.subcontractor_capacity_risk_gte, 75) ||
    relationshipScore <= toNumber(autoNoBid.owner_relationship_score_lte, 30)
  );
}

function scoreDeal(deal, model, contractor, historicalBids) {
  const weights = model.weights || {};

  const strategicFit = deriveStrategicFit(deal, contractor, historicalBids);
  const relationshipGraph = deriveRelationshipScore(deal, model);
  const capacity = deriveSubcontractorHealthAndRisk(deal, model);
  const marketTiming = clamp(deal.market_timing_score, 0, 100);
  const marginPotential = deriveMarginPotential(deal.target_margin_pct);
  const executionReadiness = clamp(deal.execution_readiness_score, 0, 100);
  const riskPenalty = deriveRiskPenalty(deal.risk_flags, toNumber(deal.bid_due_days, 30));

  const weightedPositive =
    strategicFit * toNumber(weights.strategic_fit, 0) +
    relationshipGraph * toNumber(weights.relationship_graph, 0) +
    capacity.healthScore * toNumber(weights.subcontractor_capacity_health, 0) +
    marketTiming * toNumber(weights.market_timing, 0) +
    marginPotential * toNumber(weights.margin_potential, 0) +
    executionReadiness * toNumber(weights.execution_readiness, 0);

  const weightedPenalty = riskPenalty * Math.abs(toNumber(weights.risk_penalty, 0));
  const rawScore = clamp(weightedPositive - weightedPenalty, 0, 100);

  const autoNoBid = hardStopTriggered(rawScore, relationshipGraph, capacity.riskScore, model);
  const mappedBand = bandForScore(rawScore, model);

  const recommendation = autoNoBid
    ? { decision: "No Bid", confidence: "high", reason: "Hard-stop rule triggered" }
    : {
        decision: mappedBand?.name || "Conditional Bid",
        confidence: mappedBand?.confidence || "medium",
        reason: "Mapped from DSI decision band"
      };

  return {
    deal_id: deal.deal_id,
    deal_name: deal.deal_name,
    contractor_id: deal.contractor_id,
    region: deal.region,
    project_type: deal.project_type,
    dsi_score: Number(rawScore.toFixed(1)),
    recommendation,
    component_scores: {
      strategic_fit: Number(strategicFit.toFixed(1)),
      relationship_graph: Number(relationshipGraph.toFixed(1)),
      subcontractor_capacity_health: Number(capacity.healthScore.toFixed(1)),
      subcontractor_capacity_risk: Number(capacity.riskScore.toFixed(1)),
      market_timing: Number(marketTiming.toFixed(1)),
      margin_potential: Number(marginPotential.toFixed(1)),
      execution_readiness: Number(executionReadiness.toFixed(1)),
      risk_penalty: Number(riskPenalty.toFixed(1))
    },
    subcontractor_trade_risk: capacity.tradeRisks,
    explainability: [
      `Relationship graph score ${relationshipGraph.toFixed(1)} based on weighted owner/developer ties`,
      `Subcontractor capacity risk ${capacity.riskScore.toFixed(1)} from trade utilization map`,
      `Risk penalty ${riskPenalty.toFixed(1)} from technical and owner-risk flags`
    ]
  };
}

function main() {
  const model = readJson(MODEL_PATH);
  const opportunities = readJson(DEALS_PATH);
  const contractorRegistry = readJson(CONTRACTORS_PATH);
  const historicalBids = readJson(BIDS_PATH);

  const contractors = Array.isArray(contractorRegistry?.contractors) ? contractorRegistry.contractors : [];
  const records = Array.isArray(historicalBids?.records) ? historicalBids.records : [];
  const deals = Array.isArray(opportunities?.opportunities) ? opportunities.opportunities : [];

  const scoredDeals = deals.map((deal) => {
    const contractor = contractors.find((c) => c.id === deal.contractor_id) || null;
    return scoreDeal(deal, model, contractor, records);
  });

  const out = {
    schema_version: "1.0.0",
    generated_at: new Date().toISOString(),
    model: {
      name: model.name,
      version: model.version
    },
    summary: {
      deals_scored: scoredDeals.length,
      average_dsi: scoredDeals.length
        ? Number((scoredDeals.reduce((sum, deal) => sum + deal.dsi_score, 0) / scoredDeals.length).toFixed(1))
        : null,
      bid_count: scoredDeals.filter((d) => d.recommendation.decision === "Bid").length,
      conditional_bid_count: scoredDeals.filter((d) => d.recommendation.decision === "Conditional Bid").length,
      no_bid_count: scoredDeals.filter((d) => d.recommendation.decision === "No Bid").length
    },
    deals: scoredDeals
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2), "utf8");
  console.log(`Wrote ${OUT_PATH}`);
}

main();
