#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { MARKETS_INDEX_ASSET_PATH, normalizeAssetPath } from "../src/lib/markets_assets.js";

const ROOT = process.cwd();
const ASSET_ROOT_DIR = "dist";
const DIST_PREFIX = "dist/";
const INDEX_RUNTIME_PATH = normalizeAssetPath(MARKETS_INDEX_ASSET_PATH);
const INDEX_PATH = path.join(ROOT, ASSET_ROOT_DIR, INDEX_RUNTIME_PATH);

function fail(message) {
  console.error(`validate_markets_assets: FAIL - ${message}`);
  process.exit(1);
}

if (!fs.existsSync(INDEX_PATH)) {
  fail(`${MARKETS_INDEX_ASSET_PATH} is missing`);
}

let raw;
try {
  raw = fs.readFileSync(INDEX_PATH, "utf8");
} catch (err) {
  fail(`unable to read ${MARKETS_INDEX_ASSET_PATH} (${err?.message || err})`);
}

let parsed;
try {
  parsed = JSON.parse(raw);
} catch (err) {
  fail(`${MARKETS_INDEX_ASSET_PATH} is not valid JSON (${err?.message || err})`);
}

const markets = parsed?.markets;
if (!Array.isArray(markets) || markets.length === 0) {
  fail(`${MARKETS_INDEX_ASSET_PATH} must contain a non-empty markets[] array`);
}

const missing = [];
for (const entry of markets) {
  const marketId = typeof entry?.id === "string" ? entry.id : "unknown";
  const marketPath = typeof entry?.path === "string" ? entry.path.trim() : "";
  if (!marketPath) {
    missing.push({ market: marketId, reason: "path missing" });
    continue;
  }

  const normalized = normalizeAssetPath(marketPath);
  if (normalized.startsWith(DIST_PREFIX)) {
    missing.push({ market: marketId, reason: `invalid runtime path ${normalized}; paths must be asset-root relative when assets.directory=./dist` });
    continue;
  }

  const fullPath = path.join(ROOT, ASSET_ROOT_DIR, normalized);
  if (!fs.existsSync(fullPath)) {
    missing.push({ market: marketId, reason: `missing file at ${normalized}` });
  }
}

if (missing.length > 0) {
  for (const item of missing) {
    console.error(` - ${item.market}: ${item.reason}`);
  }
  fail(`missing ${missing.length} market artifact(s) referenced by ${MARKETS_INDEX_ASSET_PATH}`);
}

console.log(`validate_markets_assets: PASS (${markets.length} markets)`);
