#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const INDEX_PATH = path.join(ROOT, "dist", "markets", "index.json");

function fail(message) {
  console.error(`validate_markets_assets: FAIL - ${message}`);
  process.exit(1);
}

if (!fs.existsSync(INDEX_PATH)) {
  fail("dist/markets/index.json is missing");
}

let raw;
try {
  raw = fs.readFileSync(INDEX_PATH, "utf8");
} catch (err) {
  fail(`unable to read dist/markets/index.json (${err?.message || err})`);
}

let parsed;
try {
  parsed = JSON.parse(raw);
} catch (err) {
  fail(`dist/markets/index.json is not valid JSON (${err?.message || err})`);
}

const markets = parsed?.markets;
if (!Array.isArray(markets) || markets.length === 0) {
  fail("dist/markets/index.json must contain a non-empty markets[] array");
}

const missing = [];
for (const entry of markets) {
  const marketId = typeof entry?.id === "string" ? entry.id : "unknown";
  const marketPath = typeof entry?.path === "string" ? entry.path.trim() : "";
  if (!marketPath) {
    missing.push({ market: marketId, reason: "path missing" });
    continue;
  }

  const normalized = marketPath.replace(/^\/+/, "");
  const fullPath = path.join(ROOT, normalized);
  if (!fs.existsSync(fullPath)) {
    missing.push({ market: marketId, reason: `missing file at ${normalized}` });
  }
}

if (missing.length > 0) {
  for (const item of missing) {
    console.error(` - ${item.market}: ${item.reason}`);
  }
  fail(`missing ${missing.length} market artifact(s) referenced by dist/markets/index.json`);
}

console.log(`validate_markets_assets: PASS (${markets.length} markets)`);
