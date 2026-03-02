// scripts/build_project_intel_latest.mjs
// Backward-compatible entrypoint for legacy project-intel builds.
// Delegates to the maintained Projects Intelligence Plane builder.

import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const targetScript = path.join(ROOT, "scripts", "build_projects_plane_latest.mjs");

console.warn("[deprecated] build_project_intel_latest.mjs now delegates to build_projects_plane_latest.mjs");

const result = spawnSync(process.execPath, [targetScript], {
  cwd: ROOT,
  stdio: "inherit",
  env: process.env
});

if (typeof result.status === "number") {
  process.exit(result.status);
}

console.error("Failed to run delegated project intelligence build.");
process.exit(1);
