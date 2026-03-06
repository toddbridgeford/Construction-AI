#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { MARKETS_INDEX_ASSET_PATH, normalizeAssetPath } from "../src/lib/markets_assets.js";

const repoRoot = process.cwd();
const sourceDistDir = path.join(repoRoot, "dist");
const deployRootDir = path.join(repoRoot, ".deploy-assets");
const deployDistDir = path.join(deployRootDir, "dist");
const runtimeMarketsIndexPath = normalizeAssetPath(MARKETS_INDEX_ASSET_PATH);
const deployMarketsIndex = path.join(deployDistDir, runtimeMarketsIndexPath);

function copyDirectoryRecursive(sourceDir, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      copyDirectoryRecursive(sourcePath, targetPath);
      continue;
    }

    fs.copyFileSync(sourcePath, targetPath);
  }
}

if (!fs.existsSync(sourceDistDir) || !fs.statSync(sourceDistDir).isDirectory()) {
  console.error("ERROR: dist directory does not exist. Run the artifact generation workflow first.");
  process.exit(1);
}

fs.rmSync(deployRootDir, { recursive: true, force: true });
fs.mkdirSync(deployRootDir, { recursive: true });
copyDirectoryRecursive(sourceDistDir, deployDistDir);

if (!fs.existsSync(deployMarketsIndex)) {
  console.error(`ERROR: Missing .deploy-assets/${runtimeMarketsIndexPath} in deploy bundle.`);
  process.exit(1);
}

const marketsIndexRaw = fs.readFileSync(deployMarketsIndex, "utf8");
let marketsIndex;

try {
  marketsIndex = JSON.parse(marketsIndexRaw);
} catch (error) {
  console.error(`ERROR: Invalid JSON in ${path.relative(repoRoot, deployMarketsIndex)}:`, error.message);
  process.exit(1);
}

const markets = Array.isArray(marketsIndex?.markets) ? marketsIndex.markets : [];
for (const market of markets) {
  const marketPath = typeof market?.path === "string" ? market.path : "";
  if (!marketPath) {
    console.error("ERROR: Market entry missing path in markets/index.json");
    process.exit(1);
  }

  const bundledPath = path.join(deployDistDir, normalizeAssetPath(marketPath));
  if (!fs.existsSync(bundledPath)) {
    console.error(`ERROR: Referenced market file missing from deploy bundle: ${marketPath}`);
    process.exit(1);
  }
}

console.log(`Prepared deploy bundle at ${path.relative(repoRoot, deployRootDir)}/`);
console.log(`Verified runtime path ${runtimeMarketsIndexPath} and ${markets.length} referenced market file(s).`);
