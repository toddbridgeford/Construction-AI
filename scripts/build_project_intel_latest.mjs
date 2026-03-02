import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const PROJECT_INPUT = JSON.parse(fs.readFileSync("config/project_input.json", "utf8"));
const CONTRACTORS = JSON.parse(fs.readFileSync("config/contractors_registry.json", "utf8"));
const MODEL = JSON.parse(fs.readFileSync("framework/win_probability_model_v1.json", "utf8"));

function scoreContractor(contractor, project) {
  let score = 0;

  // Scope fit
  if (contractor.trades.includes(project.scope)) {
    score += MODEL.weights.scope_fit * 100;
  }

  // Distance band (simplified)
  const band = "0-25";
  const distanceWeight = MODEL.distance_bands[band] || 0.2;
  score += MODEL.weights.proximity * distanceWeight * 100;

  // Project type experience
  if (contractor.project_types.includes(project.project_type)) {
    score += MODEL.weights.project_type_experience * 100;
  }

  return Math.round(score);
}

function main() {
  const results = CONTRACTORS.contractors.map(c => {
    const score = scoreContractor(c, PROJECT_INPUT);
    return {
      contractor_id: c.id,
      name: c.name,
      win_score: score
    };
  });

  const output = {
    project_id: PROJECT_INPUT.project_id,
    project_name: PROJECT_INPUT.project_name,
    location: PROJECT_INPUT.location,
    radius_miles: PROJECT_INPUT.radius_miles,
    scope: PROJECT_INPUT.scope,
    estimated_value: PROJECT_INPUT.estimated_value,
    nearby_contractors: results.sort((a, b) => b.win_score - a.win_score),
    award_detection: {
      status: "not_checked",
      awarded_to: null,
      source_url: null,
      publication_date: null,
      confidence: null
    },
    generated_at: new Date().toISOString()
  };

  fs.mkdirSync("dist/projects", { recursive: true });
  fs.writeFileSync(
    `dist/projects/${PROJECT_INPUT.project_id}_intel_latest.json`,
    JSON.stringify(output, null, 2)
  );

  console.log("Project intelligence generated.");
}

main();
