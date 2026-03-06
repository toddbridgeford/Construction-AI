#!/usr/bin/env node
import { buildYtdPytdFromObservations } from "../src/routes/spending_ytd.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function approx(actual, expected, msg) {
  if (Math.abs(actual - expected) > 1e-12) {
    throw new Error(`${msg}: expected=${expected} actual=${actual}`);
  }
}

function run() {
  const synthetic = [
    { date: "2025-03-01", value: "132000000" },
    { date: "2025-02-01", value: "120000000" },
    { date: "2025-01-01", value: "120000000" },
    { date: "2024-12-01", value: "120000000" },
    { date: "2024-11-01", value: "120000000" },
    { date: "2024-10-01", value: "120000000" },
    { date: "2024-09-01", value: "120000000" },
    { date: "2024-08-01", value: "120000000" },
    { date: "2024-07-01", value: "120000000" },
    { date: "2024-06-01", value: "120000000" },
    { date: "2024-05-01", value: "120000000" },
    { date: "2024-04-01", value: "120000000" },
    { date: "2024-03-01", value: "114000000" },
    { date: "2024-02-01", value: "108000000" },
    { date: "2024-01-01", value: "96000000" },
    { date: "2023-03-01", value: "100000000" },
    { date: "2023-02-01", value: "100000000" },
    { date: "2023-01-01", value: "100000000" },
  ];

  const defaultYear = buildYtdPytdFromObservations(synthetic);
  assert(defaultYear.year === 2024, "Expected default year to use latest complete year");

  const result = buildYtdPytdFromObservations(synthetic, 2025);
  assert(result.year === 2025, "Expected target year 2025");
  assert(result.months_included.length === 3, "Expected Jan..Mar months included");
  approx(result.ytd_monthly_equiv_musd, 31, "Unexpected YTD MUSD total");
  approx(result.pytd_monthly_equiv_musd, 26.5, "Unexpected PYTD MUSD total");

  const withNoise = [
    { date: "2025-03-01", value: "bad" },
    { date: "2025-02-01", value: "." },
    { date: "2025-01-01", value: "120000000" },
    { date: "2024-12-01", value: "120000000" },
    { date: "2024-11-01", value: "120000000" },
    { date: "2024-10-01", value: "120000000" },
    { date: "2024-09-01", value: "120000000" },
    { date: "2024-08-01", value: "120000000" },
    { date: "2024-07-01", value: "120000000" },
    { date: "2024-06-01", value: "120000000" },
    { date: "2024-05-01", value: "120000000" },
    { date: "2024-04-01", value: "120000000" },
    { date: "2024-03-01", value: "114000000" },
    { date: "2024-01-01", value: "96000000" },
  ];

  const edge = buildYtdPytdFromObservations(withNoise, 2025);
  assert(edge.months_included.length === 1, "Non-numeric months should be skipped");
  approx(edge.ytd_monthly_equiv_musd, 10, "Unexpected edge YTD MUSD total");

  console.log("smoke_worker_node: PASS");
}

try {
  run();
} catch (err) {
  console.error("smoke_worker_node: FAIL");
  console.error(err?.stack || String(err));
  process.exit(1);
}
