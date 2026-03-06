#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const DIST_DIR = path.join(ROOT, "dist", "markets");
const INDEX_PATH = path.join(DIST_DIR, "index.json");

function fail(message, details = null) {
  const suffix = details ? `\n${JSON.stringify(details, null, 2)}` : "";
  console.error(`market_artifacts_validation: FAIL - ${message}${suffix}`);
  process.exit(1);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`Unable to parse JSON file: ${path.relative(ROOT, filePath)}`, { message: error.message });
  }
}

if (!fs.existsSync(INDEX_PATH)) {
  fail("Missing required market artifact index", { required_file: path.relative(ROOT, INDEX_PATH) });
}

const index = readJson(INDEX_PATH);
const entries = Array.isArray(index?.markets) ? index.markets : null;
if (!entries || entries.length === 0) {
  fail("Market index has no entries", { required_field: "markets[]", file: path.relative(ROOT, INDEX_PATH) });
}

const missingFiles = [];
const invalidPaths = [];
for (const entry of entries) {
  const marketId = typeof entry?.id === "string" ? entry.id : "unknown";
  const rawPath = typeof entry?.path === "string" ? entry.path.trim() : "";

  if (!rawPath) {
    invalidPaths.push({ market: marketId, reason: "missing path" });
    continue;
  }

  const normalized = rawPath.replace(/^\/+/, "");
  const relativePath = normalized.startsWith("dist/") ? normalized : `dist/${normalized}`;
  if (!relativePath.startsWith("dist/markets/")) {
    invalidPaths.push({ market: marketId, reason: "path must be under dist/markets", path: rawPath });
    continue;
  }

  const absPath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absPath)) {
    missingFiles.push({ market: marketId, path: relativePath });
    continue;
  }

  const payload = readJson(absPath);
  const pressure = payload?.indices?.pressure_index?.value;
  if (!Number.isFinite(pressure) && marketId === "national") {
    invalidPaths.push({ market: marketId, reason: "national market must include numeric indices.pressure_index.value", path: relativePath });
  }
}

if (invalidPaths.length > 0) {
  fail("Market index contains invalid entries", invalidPaths);
}

if (missingFiles.length > 0) {
  fail("Market index references missing market files", missingFiles);
}

console.log(`market_artifacts_validation: PASS (${entries.length} market files verified)`);
