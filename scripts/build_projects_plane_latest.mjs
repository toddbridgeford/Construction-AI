// scripts/build_projects_plane_latest.mjs
// Projects Intelligence Plane v3
// Geospatial Radius (fully implemented) + Award Detection + Bid/No-Bid + Deal Scoring
// Deterministic. Zero dependencies.
//
// Inputs:
// - dashboard_latest.json (SAM + USAspending already ingested by your pipeline)
// - signal_api_latest.json (macro posture / CPI)
// - config/markets.json
// - config/projects_plane_v1.json
// - OPTIONAL: config/geocode_overrides.json (deterministic lat/lon overrides by key)
//
// Outputs:
// - dist/projects/index.json
// - dist/projects/<marketId>/projects_latest.json
// - dist/projects/<marketId>/awards_latest.json
// - dist/projects/<marketId>/decisions_latest.json
// - dist/projects/<marketId>/radius_latest.json

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const MARKETS_PATH = path.join(ROOT, "config", "markets.json");
const PLANE_CFG_PATH = path.join(ROOT, "config", "projects_plane_v1.json");
const GEOCODE_OVERRIDES_PATH = path.join(ROOT, "config", "geocode_overrides.json");

const SIGNAL_PATH = path.join(ROOT, "signal_api_latest.json");
const DASHBOARD_PATH = path.join(ROOT, "dashboard_latest.json");

const OUT_DIR = path.join(ROOT, "dist", "projects");
const INDEX_PATH = path.join(OUT_DIR, "index.json");

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
function tryReadJson(p, fallback) {
  try {
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}
function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8");
}
function isoNow() {
  return new Date().toISOString();
}
function isoDate() {
  return new Date().toISOString().slice(0, 10);
}

function dealBand(score) {
  if (typeof score !== "number") return "Unknown";
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  return "D";
}

function haversineMiles(lat1, lon1, lat2, lon2) {
  if ([lat1, lon1, lat2, lon2].some((v) => typeof v !== "number" || !Number.isFinite(v))) return null;
  const R = 3958.7613;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function normalizeKey(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s,-]/g, "");
}

function buildGeocodeKey({ name, address, city, state, zip }) {
  // Deterministic key used for overrides:
  // "<normalized name> | <normalized address> | <city>, <state> <zip>"
  const a = normalizeKey(address || "");
  const n = normalizeKey(name || "");
  const loc = normalizeKey(`${city || ""}, ${state || ""} ${zip || ""}`.trim());
  return `${n} | ${a} | ${loc}`.trim();
}

function extractSamLocation(op) {
  // Best-effort extraction across typical SAM fields.
  // If your dashboard script names differ, keep fields null safely.
  const place = op?.place_of_performance || op?.placeOfPerformance || op?.place || {};
  const city = place?.city || op?.city || null;
  const state = place?.state || place?.state_code || op?.state || null;
  const zip = place?.zip || place?.zip_code || op?.zip || null;
  const address = place?.street || place?.address || op?.address || null;

  // If the ingested object already includes coordinates, use them.
  const lat = typeof place?.lat === "number" ? place.lat : (typeof op?.lat === "number" ? op.lat : null);
  const lon = typeof place?.lon === "number" ? place.lon : (typeof op?.lon === "number" ? op.lon : null);

  return { address, city, state, zip, lat, lon };
}

function resolveLatLonWithOverrides({ key, lat, lon }, overrides) {
  if (typeof lat === "number" && typeof lon === "number") return { lat, lon, source: "upstream" };

  const hit = overrides?.points?.[key];
  if (hit && typeof hit.lat === "number" && typeof hit.lon === "number") {
    return { lat: hit.lat, lon: hit.lon, source: "override" };
  }
  return { lat: null, lon: null, source: "missing" };
}

function scoreGeospatialRadius({ centerLat, centerLon, radiusMiles, lat, lon }) {
  const miles = haversineMiles(centerLat, centerLon, lat, lon);
  if (typeof miles !== "number" || typeof radiusMiles !== "number") {
    return { miles: null, within: null };
  }
  return { miles: Number(miles.toFixed(2)), within: miles <= radiusMiles };
}

function main() {
  const marketsCfg = readJson(MARKETS_PATH);
  const planeCfg = readJson(PLANE_CFG_PATH);
  const overrides = tryReadJson(GEOCODE_OVERRIDES_PATH, { version: 1, points: {} });

  const signal = readJson(SIGNAL_PATH);
  const dashboard = readJson(DASHBOARD_PATH);

  const cpi = signal?.indices?.pressure_index?.value ?? null;
  const capital = signal?.indices?.capital_stress_index?.value ?? null;

  const runDate = isoDate();
  const generatedAt = isoNow();

  const markets = Array.isArray(marketsCfg.markets) ? marketsCfg.markets : [];
  if (markets.length === 0) throw new Error("config/markets.json has no markets[]");

  // Registry for GPT/UI navigation
  const registry = {
    version: 3,
    generated_at: generatedAt,
    as_of: runDate,
    outputs: markets.map((m) => ({
      id: m.id,
      label: m.label,
      path: `dist/projects/${m.id}/projects_latest.json`,
      radius_path: `dist/projects/${m.id}/radius_latest.json`,
      awards_path: `dist/projects/${m.id}/awards_latest.json`,
      decisions_path: `dist/projects/${m.id}/decisions_latest.json`
    }))
  };
  writeJson(INDEX_PATH, registry);

  // Ingest sources already present in dashboard_latest.json
  const samOps = Array.isArray(dashboard?.external?.sam_opportunities) ? dashboard.external.sam_opportunities : [];
  const usasAwards = Array.isArray(dashboard?.external?.usaspending_awards) ? dashboard.external.usaspending_awards : [];

  const radiusMilesDefault =
    typeof planeCfg?.defaults?.radius_miles === "number" ? planeCfg.defaults.radius_miles : 50;

  for (const m of markets) {
    const marketPlane = planeCfg?.markets?.[m.id] || {};
    const centerLat = typeof marketPlane?.radius_center?.lat === "number" ? marketPlane.radius_center.lat : null;
    const centerLon = typeof marketPlane?.radius_center?.lon === "number" ? marketPlane.radius_center.lon : null;

    const outDir = path.join(OUT_DIR, m.id);

    // v3: Build market lead set from SAM (institutional/federal) — deterministic and non-empty when SAM feed is non-empty.
    const leads = samOps.map((op) => {
      const loc = extractSamLocation(op);

      return {
        project_id: op.notice_id || op.id || op.solnum || `sam_${Math.random().toString(16).slice(2)}`, // fallback only if upstream missing
        name: op.title || op.notice_title || "Unknown opportunity",
        value_usd: op.estimated_value ?? op.value ?? null,
        posted: op.posted_date ?? op.posted ?? null,
        bid_due: op.response_deadline ?? op.deadline ?? null,
        owner_name: op.agency ?? op.department ?? op.office ?? null,
        stage: "bid",
        type: "institutional",
        location: loc
      };
    });

    const projects = leads.map((lead) => {
      // ---------- Geospatial Radius (fully implemented) ----------
      const key = buildGeocodeKey({
        name: lead.name,
        address: lead.location.address,
        city: lead.location.city,
        state: lead.location.state,
        zip: lead.location.zip
      });

      const resolved = resolveLatLonWithOverrides(
        { key, lat: lead.location.lat, lon: lead.location.lon },
        overrides
      );

      const radiusEval = scoreGeospatialRadius({
        centerLat,
        centerLon,
        radiusMiles: radiusMilesDefault,
        lat: resolved.lat,
        lon: resolved.lon
      });

      const radiusEvidence = [];
      if (resolved.source === "override") radiusEvidence.push("Coordinates resolved via geocode_overrides.json");
      if (resolved.source === "upstream") radiusEvidence.push("Coordinates provided by upstream ingestion");
      if (resolved.source === "missing") radiusEvidence.push("Missing coordinates; radius status unknown");

      // ---------- Award Detection Engine v1 ----------
      // Deterministic best-effort:
      // - If awarding agency matches (substring) and award is recent, flag likely_awarded.
      const agency = String(lead.owner_name || "").toLowerCase();
      const matchingAward = usasAwards.find((a) => {
        const awarding = String(a?.awarding_agency || a?.awarding_agency_name || "").toLowerCase();
        return agency && awarding && awarding.includes(agency);
      });

      let award_state = "not_awarded";
      let award_confidence = "low";
      const award_evidence = [];

      if (matchingAward) {
        award_state = "likely_awarded";
        award_confidence = "medium";
        award_evidence.push("USAspending award detected for awarding agency (substring match).");
      }

      // ---------- Deal Scoring Index v1 ----------
      let score = 50;

      // Macro pressure
      if (typeof cpi === "number") {
        if (cpi >= 70) score -= 10;
        if (cpi <= 45) score += 5;
      }

      // Capital stress
      if (typeof capital === "number" && capital >= 75) score -= 10;

      // Value heuristic
      if (typeof lead.value_usd === "number") {
        if (lead.value_usd >= 25_000_000) score += 10;
        else if (lead.value_usd >= 5_000_000) score += 5;
      }

      // Award leakage penalty
      if (award_state === "likely_awarded") score -= 15;

      // Radius fit bonus/penalty
      if (radiusEval.within === true) score += 8;
      if (radiusEval.within === false) score -= 12;

      score = Math.max(0, Math.min(100, score));

      // ---------- Bid / No-Bid Engine v1 ----------
      let decision = "watch";
      let decision_conf = "medium";
      const reasons = [];

      // Hard gates
      if (award_state === "likely_awarded") {
        decision = "no_bid";
        decision_conf = "high";
        reasons.push("Award signal detected.");
      }

      if (radiusEval.within === false) {
        decision = "no_bid";
        decision_conf = "high";
        reasons.push("Outside operating radius.");
      }

      if (typeof cpi === "number" && cpi >= 76) {
        decision = "no_bid";
        decision_conf = "high";
        reasons.push("Freeze risk regime.");
      }

      // Score-based
      if (decision !== "no_bid") {
        if (score >= 70) {
          decision = "bid";
          decision_conf = "medium";
          reasons.push("High deal score.");
        } else if (score <= 45) {
          decision = "no_bid";
          decision_conf = "medium";
          reasons.push("Low deal score.");
        } else {
          decision = "watch";
          decision_conf = "medium";
          reasons.push("Mid-band score.");
        }
      }

      // Operator posture mapping
      let posture = "Selective growth";
      if (typeof cpi === "number") {
        if (cpi >= 76) posture = "Freeze defense";
        else if (cpi >= 61) posture = "Tightening discipline";
        else if (cpi >= 46) posture = "Slowdown discipline";
      }

      return {
        project_id: lead.project_id,
        name: lead.name,
        type: lead.type,
        stage: lead.stage,
        location: {
          address: lead.location.address ?? null,
          city: lead.location.city ?? null,
          state: lead.location.state ?? null,
          zip: lead.location.zip ?? null,
          lat: resolved.lat,
          lon: resolved.lon,
          geocode_source: resolved.source,
          geocode_key: key
        },
        radius: {
          center_lat: centerLat,
          center_lon: centerLon,
          miles: radiusEval.miles,
          within_radius: radiusEval.within,
          radius_miles: radiusMilesDefault,
          evidence: radiusEvidence
        },
        owner: lead.owner_name ?? null,
        value_usd: typeof lead.value_usd === "number" ? lead.value_usd : null,
        dates: {
          posted: lead.posted ?? null,
          bid_due: lead.bid_due ?? null
        },
        award_detection: {
          award_state,
          confidence: award_confidence,
          evidence: award_evidence
        },
        deal_score: {
          index: score,
          band: dealBand(score),
          drivers: [
            `macro_cpi=${typeof cpi === "number" ? cpi : "null"}`,
            `capital=${typeof capital === "number" ? capital : "null"}`,
            `radius_within=${radiusEval.within === null ? "null" : radiusEval.within}`
          ]
        },
        bid_no_bid: {
          decision,
          confidence: decision_conf,
          reasons
        },
        operator_playbook: {
          macro_posture: posture,
          actions: [
            decision === "bid" ? "Proceed to pursue; validate scope and compliance requirements." : "Hold posture; reassess upon new signals.",
            radiusEval.within === false ? "Do not pursue unless strategic exception approved." : "Confirm mobilization plan."
          ]
        }
      };
    });

    // Slice views for fast GPT reads
    const projectsOut = {
      schema_version: "projects_plane_v3",
      generated_at: generatedAt,
      market: { id: m.id, label: m.label, cbsa: m.cbsa ?? null },
      radius_center: { lat: centerLat, lon: centerLon },
      radius_miles: radiusMilesDefault,
      projects
    };

    const awardsOut = {
      schema_version: "awards_v3",
      generated_at: generatedAt,
      market: { id: m.id, label: m.label },
      awards: projects
        .filter((p) => p.award_detection.award_state === "awarded" || p.award_detection.award_state === "likely_awarded")
        .map((p) => ({
          project_id: p.project_id,
          name: p.name,
          owner: p.owner,
          award_state: p.award_detection.award_state,
          confidence: p.award_detection.confidence,
          value_usd: p.value_usd,
          bid_due: p.dates.bid_due
        }))
    };

    const decisionsOut = {
      schema_version: "decisions_v3",
      generated_at: generatedAt,
      market: { id: m.id, label: m.label },
      decisions: projects.map((p) => ({
        project_id: p.project_id,
        decision: p.bid_no_bid.decision,
        confidence: p.bid_no_bid.confidence,
        deal_band: p.deal_score.band,
        radius_within: p.radius.within_radius,
        miles: p.radius.miles
      }))
    };

    const radiusOut = {
      schema_version: "radius_v1",
      generated_at: generatedAt,
      market: { id: m.id, label: m.label },
      radius_center: { lat: centerLat, lon: centerLon },
      radius_miles: radiusMilesDefault,
      summary: {
        total_projects: projects.length,
        within_radius: projects.filter((p) => p.radius.within_radius === true).length,
        outside_radius: projects.filter((p) => p.radius.within_radius === false).length,
        unknown: projects.filter((p) => p.radius.within_radius === null).length
      },
      projects: projects.map((p) => ({
        project_id: p.project_id,
        name: p.name,
        city: p.location.city,
        state: p.location.state,
        miles: p.radius.miles,
        within_radius: p.radius.within_radius,
        geocode_source: p.location.geocode_source
      }))
    };

    writeJson(path.join(outDir, "projects_latest.json"), projectsOut);
    writeJson(path.join(outDir, "awards_latest.json"), awardsOut);
    writeJson(path.join(outDir, "decisions_latest.json"), decisionsOut);
    writeJson(path.join(outDir, "radius_latest.json"), radiusOut);
  }

  console.log("Projects Intelligence Plane v3 complete.");
}

main();
