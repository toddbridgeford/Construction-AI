# Construction AI

Canonical Cloudflare Worker + artifact pipelines for Construction AI.

## Canonical architecture

- **Production Worker name:** `construction-ai`
- **Canonical base URL:** `https://construction-ai.toddbridgeford.workers.dev`
- **Canonical Wrangler config:** `wrangler.toml` at repository root.
- **Canonical Worker entrypoint:** `src/worker.js`
- **Canonical OpenAPI:** `openapi.yaml` at repository root.
- **Generated data outputs:** `artifacts/`

## Repository structure

- `src/` — canonical Worker source.
- `artifacts/` — generated JSON outputs (`dashboard_latest.json`, `signal_api_latest.json`, `deal_scoring_latest.json`, snapshots).
- `dashboard/` — static dashboard assets.
- `contracts/`, `schemas/` — schemas and contracts.
- `scripts/` — build and validation scripts.
- `docs/` — operations and deployment docs.

`cloudflare/worker/` is legacy context only. Do not deploy from that folder.

## Worker routes (live + documented)

- `GET /` (alias of `/health`)
- `GET /health`
- `GET /cpi`
- `GET /fred/observations`
- `GET /notion/series`
- `GET /bundle`
- `GET /signal`
- `GET /regime`
- `GET /liquidity`
- `GET /construction-index`
- `GET /risk-score`
- `GET /construction/dashboard`
- `GET /construction/terminal`
- `GET /construction/market-radar`
- `GET /spending/ytd`
- `GET /spending/ytd/summary`
- `GET /ytd/commercial`
- `GET /ytd/housing`
- `GET /ytd/summary`

## Actions Integration (Custom GPT)

1. Open `openapi.yaml` in this repo.
2. Paste its contents into Custom GPT **Actions** schema.
3. Set the server URL to:
   `https://construction-ai.toddbridgeford.workers.dev`
4. Save and test `/health` and `/cpi` from the Actions tester.

> `/terminal` is intentionally excluded from the canonical API contract; use `/construction/terminal`.


## Terminal Endpoints

- `/construction/dashboard`
- `/construction/terminal`
- `/construction/market-radar`
- `/spending/ytd`
- `/spending/ytd/summary`

Notes:
- `terminal` = one-call operator intelligence (macro dashboard + spending summary + cycle interpretation + operator actions).
- `market-radar` = hottest vs weakest markets ranked by deterministic market pressure scoring.
- `commercial` = nonresidential construction spending.
- `housing` = residential construction spending.

## Validation

Run local OpenAPI checks:

```bash
ruby scripts/validate_openapi.rb
```

## YTD quick usage

```bash
curl "https://construction-ai.toddbridgeford.workers.dev/ytd/commercial?year=2025"
curl "https://construction-ai.toddbridgeford.workers.dev/ytd/housing?year=2025"
curl "https://construction-ai.toddbridgeford.workers.dev/ytd/summary?year=2025"
```
