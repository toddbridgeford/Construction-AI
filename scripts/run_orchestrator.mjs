import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const orchestratorPath = process.env.ORCHESTRATOR_PATH || "framework/national_autonomous_run_orchestrator_v1.json";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(ROOT, filePath), "utf-8"));
}

function runNodeScript(scriptPath) {
  return new Promise((resolve, reject) => {
    const absScript = path.resolve(ROOT, scriptPath);
    const child = spawn(process.execPath, [absScript], {
      cwd: ROOT,
      stdio: "inherit",
      env: process.env
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Script failed with exit code ${code}: ${scriptPath}`));
      }
    });
    child.on("error", reject);
  });
}

function assertOutputFiles(outputs = []) {
  for (const output of outputs) {
    const abs = path.resolve(ROOT, output);
    if (!fs.existsSync(abs)) {
      throw new Error(`Expected output not found: ${output}`);
    }
  }
}

async function main() {
  const spec = readJson(orchestratorPath);
  const steps = Array.isArray(spec.steps) ? spec.steps : [];

  console.log(`Running orchestrator: ${orchestratorPath}`);
  console.log(`Mode: ${spec.mode || "n/a"} | Steps: ${steps.length}`);

  for (const step of steps) {
    if (step.type !== "node_script") {
      throw new Error(`Unsupported step type: ${step.type}`);
    }
    if (!step.script) {
      throw new Error(`Missing script path for step: ${step.id || "unknown"}`);
    }

    console.log(`\n▶ Step: ${step.id || step.script}`);
    await runNodeScript(step.script);
    assertOutputFiles(step.outputs || []);
    console.log(`✓ Completed: ${step.id || step.script}`);
  }

  console.log("\nOrchestrator run complete.");
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
