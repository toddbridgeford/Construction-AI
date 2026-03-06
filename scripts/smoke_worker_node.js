#!/usr/bin/env node
import { computeYtdPytdFromObservations } from "../src/routes/spending_ytd.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run() {
  const synthetic = [
    { date: "2025-03-01", value: "1320" },
    { date: "2025-02-01", value: "1200" },
    { date: "2025-01-01", value: "1200" },
    { date: "2024-03-01", value: "1140" },
    { date: "2024-02-01", value: "1080" },
    { date: "2024-01-01", value: "960" },
  ];

  const result = computeYtdPytdFromObservations(synthetic, 2025);
  assert(result.year === 2025, "Expected target year 2025");
  assert(result.months_included.length === 3, "Expected Jan..Mar months included");
  assert(Math.abs(result.ytd_monthly_equiv_musd - 310) < 1e-9, "Unexpected YTD total");
  assert(Math.abs(result.pytd_monthly_equiv_musd - 265) < 1e-9, "Unexpected PYTD total");

  const withNoise = [
    { date: "2025-03-01", value: "bad" },
    { date: "2025-02-01", value: "." },
    { date: "2025-01-01", value: "1200" },
    { date: "2024-03-01", value: "1140" },
    { date: "2024-01-01", value: "960" },
  ];

  const edge = computeYtdPytdFromObservations(withNoise, 2025);
  assert(edge.months_included.length === 1, "Non-numeric months should be skipped");
  assert(Math.abs(edge.ytd_monthly_equiv_musd - 100) < 1e-9, "Unexpected edge YTD total");

  console.log("smoke_worker_node: PASS");
}

try {
  run();
} catch (err) {
  console.error("smoke_worker_node: FAIL");
  console.error(err?.stack || String(err));
  process.exit(1);
}
