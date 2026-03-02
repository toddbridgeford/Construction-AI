// scripts/build_projects_plane_latest.mjs
// Projects Intelligence Plane v1 (zero deps, deterministic)
// Emits:
// dist/projects/index.json
// dist/projects/<marketId>/{projects_latest.json, awards_latest.json, relationships_latest.json, capacity_latest.json, decisions_latest.json}

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const MARKETS_PATH = path.join(ROOT, "config", "markets.json");
const PLANE_CFG_PATH = path.join(ROOT, "config", "projects_plane_v1.json");
const SIGNAL_NATIONAL = path.join(ROOT, "signal_api_latest.json");

const OUT_DIR = path.join(ROOT, "dist", "projects");
const INDEX_PATH = path.join(OUT_DIR, "index.json");

function readJson(p) { return JSON.parse(fs.readFileSync(p, "utf8")); }
function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8");
}
function isoNow() { return new Date().toISOString(); }
function isoDate() { return new Date().toISOString().slice(0,10); }

function haversineMiles(lat1, lon1, lat2, lon2) {
  if ([lat1, lon1, lat2, lon2].some(v => typeof v !== "number")) return null;
  const R = 3958.8;
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function dealBand(score) {
  if (typeof score !== "number") return "Unknown";
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  return "D";
}

// v1 uses placeholders for project ingestion.
// You will later swap this with real feeds (SAM/USAspending/local portals/CRM export).
function loadProjectLeadsStub(marketId) {
  // Deterministic stub structure: empty list until you provide feeds.
  return [];
}

function buildProjectRecordBase(lead, market, planeCfg, nowIso) {
  return {
    project_id: lead.project_id,
    name: lead.name || "Unknown project",
    type: lead.type || "unknown",
    stage: lead.stage || "lead",
    location: {
      address: lead.address ?? null,
      city: lead.city ?? null,
      state: lead.state ?? null,
      lat: lead.lat ?? null,
      lon: lead.lon ?? null
    },
    radius: {
      center_lat: market?.radius_center?.lat ?? null,
      center_lon: market?.radius_center?.lon ?? null,
      miles: planeCfg.defaults.radius_miles ?? null,
      within_radius: null
    },
    owner_developer: {
      entity_id: lead.owner_entity_id ?? null,
      name: lead.owner_name ?? null
    },
    gc: {
      entity_id: lead.gc_entity_id ?? null,
      name: lead.gc_name ?? null
    },
    subs: Array.isArray(lead.subs) ? lead.subs : [],
    value_usd: lead.value_usd ?? null,
    dates: {
      posted: lead.posted ?? null,
      bid_due: lead.bid_due ?? null,
      award_est: lead.award_est ?? null,
      award_actual: lead.award_actual ?? null,
      start_est: lead.start_est ?? null
    },
    award_detection: {
      award_state: "unknown",
      confidence: "low",
      evidence: []
    },
    bid_history: {
      bids_seen: 0,
      wins_seen: 0,
      losses_seen: 0,
      win_rate: null,
      last_bid_date: null
    },
    relationship_graph: {
      owner_to_gc_strength: null,
      gc_to_sub_strength: null,
      entity_clusters: []
    },
    capacity_risk: {
      sub_capacity_risk: "unknown",
      evidence: []
    },
    bid_no_bid: {
      decision: "watch",
      confidence: "low",
      reasons: ["v1 stub: awaiting lead feed + history + capacity inputs"]
    },
    deal_score: {
      index: null,
      band: "Unknown",
      drivers: []
    },
    operator_playbook: {
      posture: null,
      actions: []
    }
  };
}

function main() {
  const marketsCfg = readJson(MARKETS_PATH);
  const planeCfg = readJson(PLANE_CFG_PATH);
  const nationalSignal = readJson(SIGNAL_NATIONAL);

  const runDate = isoDate();
  const generatedAt = isoNow();

  const markets = marketsCfg.markets || [];
  if (!Array.isArray(markets) || markets.length === 0) throw new Error("No markets in config/markets.json");

  // Index registry for GPT/UI
  const registry = {
    version: 1,
    generated_at: generatedAt,
    as_of: runDate,
    outputs: markets.map(m => ({
      id: m.id,
      label: m.label,
      path: `dist/projects/${m.id}/projects_latest.json`
    }))
  };
  writeJson(INDEX_PATH, registry);

  // Build each market’s project plane artifacts
  for (const m of markets) {
    const marketPlaneCfg = planeCfg.markets?.[m.id] || {};
    const leads = loadProjectLeadsStub(m.id);

    const projects = leads.map((lead) => {
      const rec = buildProjectRecordBase(lead, marketPlaneCfg, planeCfg, generatedAt);

      // Radius evaluation if coords exist
      const miles = haversineMiles(
        marketPlaneCfg?.radius_center?.lat,
        marketPlaneCfg?.radius_center?.lon,
        rec.location.lat,
        rec.location.lon
      );
      if (typeof miles === "number" && typeof planeCfg.defaults.radius_miles === "number") {
        rec.radius.within_radius = miles <= planeCfg.defaults.radius_miles;
      }

      // Operator playbook integration (macro → project posture)
      const cpi = nationalSignal?.indices?.pressure_index?.value ?? null;
      if (typeof cpi === "number") {
        if (cpi >= 76) rec.operator_playbook.posture = "Freeze defense";
        else if (cpi >= 61) rec.operator_playbook.posture = "Tightening defense";
        else if (cpi >= 46) rec.operator_playbook.posture = "Slowdown discipline";
        else rec.operator_playbook.posture = "Selective growth";
      }

      return rec;
    });

    const marketOutDir = path.join(OUT_DIR, m.id);

    // Split views: each is a thin slice for faster GPT reads
    const projectsOut = {
      schema_version: "project_output_v1",
      generated_at: generatedAt,
      market: { id: m.id, label: m.label, cbsa: m.cbsa ?? null },
      projects
    };

    const awardsOut = {
      schema_version: "awards_v1",
      generated_at: generatedAt,
      market: { id: m.id, label: m.label },
      awards: projects
        .filter(p => p.award_detection.award_state === "awarded")
        .map(p => ({ project_id: p.project_id, name: p.name, value_usd: p.value_usd, award_actual: p.dates.award_actual }))
    };

    const relationshipsOut = {
      schema_version: "relationships_v1",
      generated_at: generatedAt,
      market: { id: m.id, label: m.label },
      edges: [] // v1 stub; filled when relationship graph is computed
    };

    const capacityOut = {
      schema_version: "capacity_v1",
      generated_at: generatedAt,
      market: { id: m.id, label: m.label },
      risks: projects.map(p => ({ project_id: p.project_id, risk: p.capacity_risk.sub_capacity_risk, evidence: p.capacity_risk.evidence }))
    };

    const decisionsOut = {
      schema_version: "decisions_v1",
      generated_at: generatedAt,
      market: { id: m.id, label: m.label },
      decisions: projects.map(p => ({
        project_id: p.project_id,
        decision: p.bid_no_bid.decision,
        confidence: p.bid_no_bid.confidence,
        reasons: p.bid_no_bid.reasons,
        deal_band: p.deal_score.band
      }))
    };

    writeJson(path.join(marketOutDir, "projects_latest.json"), projectsOut);
    writeJson(path.join(marketOutDir, "awards_latest.json"), awardsOut);
    writeJson(path.join(marketOutDir, "relationships_latest.json"), relationshipsOut);
    writeJson(path.join(marketOutDir, "capacity_latest.json"), capacityOut);
    writeJson(path.join(marketOutDir, "decisions_latest.json"), decisionsOut);
  }

  console.log(`Wrote ${INDEX_PATH}`);
  console.log(`Wrote projects plane artifacts to dist/projects/<marketId>/`);
}

main();
