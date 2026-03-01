# Repository Review and Autonomous GitHub Plan

## High-level assessment

### What is working well
- The repository has a clear data-product target (`dashboard_latest.json`) and a concrete build script (`scripts/build_dashboard_latest.mjs`).
- You already define orchestration intent in `framework/national_autonomous_run_orchestrator_v1.json`.
- Source configuration is externalized into JSON under `config/`, which is good for maintainability.

### Gaps identified
- No first-class GitHub Actions pipeline currently runs your orchestrator on a schedule.
- No repository-level `.gitignore` existed, which can lead to accidental dependency/vendor commits.
- The orchestration JSON existed, but there was no generic runner to execute it from CI.

## Changes implemented in this update

1. Added a generic orchestrator runner (`scripts/run_orchestrator.mjs`) that:
   - Reads your orchestrator JSON
   - Executes each `node_script` step in order
   - Verifies declared output files exist after each step

2. Added autonomous GitHub workflow (`.github/workflows/autonomous_dashboard_refresh.yml`) that:
   - Runs on a schedule and manual dispatch
   - Installs script dependencies
   - Runs the orchestrator runner
   - Opens/updates a pull request automatically when output changes

3. Added `.gitignore` to prevent common accidental commits (`node_modules`, `.env`, editor files).

## Feedback and next recommendations

### 1) Add reliability guardrails
- Add a schema validation step for `dashboard_latest.json` so CI fails fast on malformed output.
- Add a "minimum viable output" check (required keys, timestamp freshness, non-empty critical series).

### 2) Reduce single-point failures in data fetches
- Your FRED path appears robust, but expand this pattern to every external provider so one outage does not fail the full run.

### 3) Improve operability
- Emit a compact run summary artifact (counts of successful/failed data sources).
- Add alerting (Slack/email) only on repeated failures (e.g., 3 consecutive failed runs).

### 4) Branch/PR hygiene for autonomous updates
- Keep autonomous PRs grouped by concern (data refresh only).
- Ensure generated data PRs are clearly labeled and optionally auto-merge when checks pass.

## Secrets required for full automation

To run the workflow end-to-end, configure repository secrets:
- `FRED_API_KEY` (required by current build script)
- Optional for expanded sources: `CENSUS_API_KEY`, `BLS_API_KEY`, `NEWSAPI_KEY`, `OPENFIGI_API_KEY`, `ALPHAVANTAGE_API_KEY`

