// scripts/build_projects_plane_latest.mjs
// Projects Intelligence Plane v2
// Award Detection + Bid/No-Bid + Deal Scoring
// Deterministic. Zero dependencies.

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const MARKETS_PATH = path.join(ROOT, "config", "markets.json");
const PLANE_CFG_PATH = path.join(ROOT, "config", "projects_plane_v1.json");
const SIGNAL_PATH = path.join(ROOT, "signal_api_latest.json");
const DASHBOARD_PATH = path.join(ROOT, "dashboard_latest.json");

const OUT_DIR = path.join(ROOT, "dist", "projects");
const INDEX_PATH = path.join(OUT_DIR, "index.json");

function readJson(p) { return JSON.parse(fs.readFileSync(p, "utf8")); }
function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8");
}
function isoNow() { return new Date().toISOString(); }
function isoDate() { return new Date().toISOString().slice(0,10); }

function dealBand(score) {
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  return "D";
}

function main() {

  const marketsCfg = readJson(MARKETS_PATH);
  const planeCfg = readJson(PLANE_CFG_PATH);
  const signal = readJson(SIGNAL_PATH);
  const dashboard = readJson(DASHBOARD_PATH);

  const cpi = signal?.indices?.pressure_index?.value ?? null;
  const capital = signal?.indices?.capital_stress_index?.value ?? null;

  const runDate = isoDate();
  const generatedAt = isoNow();

  const markets = marketsCfg.markets || [];

  const registry = {
    version: 2,
    generated_at: generatedAt,
    as_of: runDate,
    outputs: markets.map(m => ({
      id: m.id,
      label: m.label,
      path: `dist/projects/${m.id}/projects_latest.json`
    }))
  };

  writeJson(INDEX_PATH, registry);

  for (const m of markets) {

    const sam = dashboard?.external?.sam_opportunities ?? [];
    const awards = dashboard?.external?.usaspending_awards ?? [];

    const leads = sam.map(op => ({
      project_id: op.notice_id || op.id,
      name: op.title,
      value_usd: op.estimated_value ?? null,
      posted: op.posted_date ?? null,
      bid_due: op.response_deadline ?? null,
      owner_name: op.agency ?? null,
      stage: "bid",
      type: "institutional"
    }));

    const projects = leads.map(lead => {

      // ---- Award Detection Engine ----
      const matchingAward = awards.find(a =>
        a.recipient_name && lead.owner_name &&
        a.awarding_agency?.toLowerCase().includes(lead.owner_name.toLowerCase())
      );

      let award_state = "not_awarded";
      let award_confidence = "low";
      let evidence = [];

      if (matchingAward) {
        award_state = "likely_awarded";
        award_confidence = "medium";
        evidence.push("Matching agency award detected in USAspending feed.");
      }

      // ---- Deal Score Engine ----
      let score = 50;

      if (typeof cpi === "number") {
        if (cpi >= 70) score -= 10;
        if (cpi <= 45) score += 5;
      }

      if (typeof capital === "number" && capital >= 75) {
        score -= 10;
      }

      if (lead.value_usd && lead.value_usd > 25000000) score += 10;

      if (award_state === "likely_awarded") score -= 15;

      score = Math.max(0, Math.min(100, score));

      // ---- Bid / No-Bid Engine ----
      let decision = "watch";
      let confidence = "medium";
      let reasons = [];

      if (award_state === "likely_awarded") {
        decision = "no_bid";
        confidence = "high";
        reasons.push("Award signal detected.");
      }
      else if (score >= 70) {
        decision = "bid";
        reasons.push("High deal score.");
      }
      else if (score <= 45) {
        decision = "no_bid";
        reasons.push("Low deal score.");
      }
      else {
        decision = "watch";
        reasons.push("Mid-band score.");
      }

      if (cpi >= 76) {
        decision = "no_bid";
        reasons.push("Freeze risk regime.");
      }

      // ---- Operator Playbook Integration ----
      let posture = "Selective growth";
      if (cpi >= 76) posture = "Defense";
      else if (cpi >= 61) posture = "Tightening discipline";
      else if (cpi >= 46) posture = "Slowdown discipline";

      return {
        project_id: lead.project_id,
        name: lead.name,
        value_usd: lead.value_usd ?? null,
        owner: lead.owner_name ?? null,
        award_detection: {
          award_state,
          confidence: award_confidence,
          evidence
        },
        deal_score: {
          index: score,
          band: dealBand(score)
        },
        bid_no_bid: {
          decision,
          confidence,
          reasons
        },
        operator_playbook: {
          macro_posture: posture
        }
      };

    });

    const outDir = path.join(OUT_DIR, m.id);

    writeJson(path.join(outDir, "projects_latest.json"), {
      schema_version: "project_output_v2",
      generated_at: generatedAt,
      market: { id: m.id, label: m.label },
      projects
    });

    writeJson(path.join(outDir, "decisions_latest.json"), {
      schema_version: "decisions_v2",
      generated_at: generatedAt,
      market: { id: m.id, label: m.label },
      decisions: projects.map(p => ({
        project_id: p.project_id,
        decision: p.bid_no_bid.decision,
        confidence: p.bid_no_bid.confidence,
        deal_band: p.deal_score.band
      }))
    });

  }

  console.log("Projects Intelligence Plane v2 complete.");
}

main();
