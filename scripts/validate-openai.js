#!/usr/bin/env node
/**
 * validate-openapi.js
 * Zero-network structural validator for ChatGPT Actions constraints:
 * - openapi == 3.1.0
 * - servers[0].url matches canonical
 * - /terminal is absent
 * - every GET path has a 200 application/json schema
 * - schema must either have non-empty properties OR be a $ref to a schema with non-empty properties
 */

const fs = require("fs");

function fail(msg) {
  console.error(`OPENAPI VALIDATION FAILED: ${msg}`);
  process.exit(1);
}

function ok(msg) {
  console.log(`OK: ${msg}`);
}

function readYaml() {
  // Prefer yaml dependency if present; fallback to ruby is not allowed here (node-only).
  let yaml;
  try {
    yaml = require("yaml");
  } catch (e) {
    fail(
      `Missing dependency "yaml". Add it with: npm i -D yaml (or bun add -d yaml).`
    );
  }

  const raw = fs.readFileSync("openapi.yaml", "utf8");
  let doc;
  try {
    doc = yaml.parse(raw);
  } catch (e) {
    fail(`YAML parse error: ${e.message}`);
  }
  return doc;
}

function isNonEmptyObject(x) {
  return !!x && typeof x === "object" && !Array.isArray(x) && Object.keys(x).length > 0;
}

function getRefName(ref) {
  // "#/components/schemas/HealthResponse" -> "HealthResponse"
  const parts = String(ref).split("/");
  return parts[parts.length - 1];
}

function main() {
  const d = readYaml();

  // 1) OpenAPI version
  if (d.openapi !== "3.1.0") fail(`openapi must be "3.1.0" (found: ${d.openapi})`);
  ok("openapi == 3.1.0");

  // 2) Server URL
  const url = d?.servers?.[0]?.url;
  const CANON = "https://construction-ai.toddbridgeford.workers.dev";
  if (url !== CANON) fail(`servers[0].url must be ${CANON} (found: ${url})`);
  ok("servers[0].url is canonical");

  // 3) No /terminal
  if (d?.paths?.["/terminal"]) fail("paths must NOT include /terminal");
  ok("/terminal absent");

  // 4) Components/schemas exist
  const schemas = d?.components?.schemas;
  if (!isNonEmptyObject(schemas)) fail("components.schemas is missing or empty");
  ok("components.schemas exists");

  // 5) Validate each GET path’s 200 JSON schema
  const paths = d.paths;
  if (!isNonEmptyObject(paths)) fail("paths is missing or empty");

  const problems = [];

  for (const [p, ops] of Object.entries(paths)) {
    if (!ops || typeof ops !== "object") continue;

    // Only validate GET operations here (your API is GET-only in the Action)
    if (!ops.get) continue;

    const r200 = ops.get?.responses?.["200"];
    if (!r200) {
      problems.push(`${p}: missing responses["200"]`);
      continue;
    }

    const appJson = r200?.content?.["application/json"];
    if (!appJson) {
      problems.push(`${p}: missing responses["200"].content["application/json"]`);
      continue;
    }

    const schema = appJson?.schema;
    if (!schema) {
      problems.push(`${p}: missing responses["200"].content["application/json"].schema`);
      continue;
    }

    // If schema uses $ref -> referenced schema must have non-empty properties
    if (schema.$ref) {
      const name = getRefName(schema.$ref);
      const target = schemas[name];
      if (!target) {
        problems.push(`${p}: $ref schema not found: ${name}`);
        continue;
      }
      if (!isNonEmptyObject(target.properties)) {
        problems.push(`${p}: referenced schema "${name}" missing non-empty properties`);
        continue;
      }
      continue;
    }

    // Inline schema must have non-empty properties
    if (!isNonEmptyObject(schema.properties)) {
      problems.push(`${p}: inline schema missing non-empty properties`);
      continue;
    }
  }

  if (problems.length) {
    fail("\n" + problems.map((x) => `- ${x}`).join("\n"));
  }

  ok("All GET endpoints have valid 200 application/json schemas");
  console.log("OPENAPI CHECKS PASSED");
}

main();
