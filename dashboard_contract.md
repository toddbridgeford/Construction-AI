# Dashboard Contract

This repository publishes `dashboard_latest.json` for ChatGPT, Notion automations, and Swift Playgrounds clients.

## Contract files

- `dashboard_schema.json`: top-level JSON schema for the payload.
- `regime_history_schema.json`: per-entry schema for `regime_history`.
- `severity_taxonomy.json`: allowed severity levels for UI alerts and cards.

## Required payload rules

1. `schema_version` must use semantic versioning.
2. `generated_at` must be UTC ISO 8601 (`date-time`).
3. `cpi.headline` and CPI components must stay in a `0..100` range.
4. `volatility_regime` must be one of `NORMAL`, `WATCH`, or `STRESS`.
5. Every regime history row must validate against `regime_history_schema.json`.

## Consumer safety expectations

- Clients should fail soft if optional keys are absent.
- UI should default unknown severities to `NORMAL`.
- Notion/GitHub workflows should surface decoding errors in logs and keep the previous valid artifact.
