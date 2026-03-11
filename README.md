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

### Canonical Product endpoints

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
- `GET /construction/morning-brief`
- `GET /construction/alerts`
- `GET /construction/recession-probability`
- `GET /construction/stress-index`
- `GET /construction/early-warning`
- `GET /construction/capital-flows`
- `GET /construction/migration-index`
- `GET /construction/scenarios`
- `GET /construction/watchlist`
- `GET /construction/watchlist/custom`
- `GET /construction/settings`
- `POST /construction/settings`
- `GET /construction/settings/defaults`
- `POST /construction/settings/reset`
- `GET /construction/settings/profiles`
- `POST /construction/settings/profiles`
- `POST /construction/settings/profiles/activate`
- `POST /construction/settings/profiles/delete`
- `POST /construction/settings/active-profile`
- `GET /spending/ytd`
- `GET /spending/ytd/summary`

### Compatibility Alias endpoints (deprecated, still supported)

- `GET /ytd/commercial` → use `GET /spending/ytd?segment=commercial`
- `GET /ytd/housing` → use `GET /spending/ytd?segment=housing`
- `GET /ytd/summary` → use `GET /spending/ytd/summary`

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
- `/construction/power`
- `/construction/heatmap`
- `/construction/forecast`
- `/construction/nowcast`
- `/construction/alerts`
- `/construction/recession-probability`
- `/construction/stress-index`
- `/construction/early-warning`
- `/construction/capital-flows`
- `/construction/migration-index`
- `/construction/morning-brief`
- `/spending/ytd/summary`

Notes:
- `terminal` = one-call Bloomberg-style construction market intelligence for operators and capital allocators.
- `market_tape` inside terminal carries raw values for signal, regime, liquidity, risk, construction index, stress, recession probability, spending momentum, and top/weakest markets.

## Terminal Intelligence Layer

- `/construction/morning-brief` — daily operator note.
- `/construction/alerts` — machine-readable active risk cards.
- `/construction/recession-probability` — deterministic next-12-month construction slowdown risk estimate.

## Advanced Intelligence Layer

OpenAPI operation tagging classifies these model-specific routes as **Advanced Model** endpoints:

- `GET /construction/power`
- `GET /construction/heatmap`
- `GET /construction/nowcast`
- `GET /construction/forecast`

- **Construction Power Index** (`/construction/power`) — quantifies who controls margin and terms across general contractors, subcontractors, distributors, manufacturers, developers, and lenders.
- **Metro Heatmap Engine** (`/construction/heatmap`) — ranks strongest vs weakest markets from canonical market artifact files using deterministic scoring.
- **Forward Construction Cycle Model** (`/construction/nowcast`) — estimates 6–12 month construction direction and recession probability using liquidity, risk, activity, and spending momentum.
- **Construction Market Forecast Engine** (`/construction/forecast`) — predicts strongest and weakest next-12-month metros using deterministic market-state scoring with macro overlays.

## Construction Market Forecast Engine

The Construction Market Forecast Engine provides a deterministic next-12-month ranking of markets most likely to strengthen or soften.

- Predicts strongest and weakest markets over the next 12 months.
- Uses transparent heuristic scoring from current market state (score, regime, signal, commentary) plus national macro overlays (nowcast, recession probability, liquidity).
- Designed for operator-grade use by developers, contractors, lenders, and investors who need explainable, actionable market direction.

## Validation

Run local OpenAPI checks:

```bash
ruby scripts/validate_openapi.rb
```

Run the deployment-confidence smoke checks for canonical public endpoints:

```bash
npm run test:smoke
```

## YTD quick usage

```bash
curl "https://construction-ai.toddbridgeford.workers.dev/ytd/commercial?year=2025"
curl "https://construction-ai.toddbridgeford.workers.dev/ytd/housing?year=2025"
curl "https://construction-ai.toddbridgeford.workers.dev/ytd/summary?year=2025"
```

## Architecture (v1)

1. **Data layer** — deterministic macro + spending ingestion, market artifact reads from `dist/markets`, and reusable helper models for cached snapshots.
2. **Intelligence layer** — modular model families: core (signal/regime/liquidity/risk/construction index), forward (nowcast/recession/early warning/stress), market (heatmap/forecast/migration), operator (power/alerts/morning brief/capital flows).
3. **API layer** — stable Worker routes with `/construction/terminal` as the canonical one-call object; no `/terminal` route.
4. **UI layer** — dense dark operator terminal powered by one shared hook using `Promise.allSettled` and graceful partial-failure rendering.
5. **GPT layer** — routing guidance to map user intent to terminal, forecast, migration, power, stress, or early-warning endpoints.

## GPT Routing Guidance

- Broad market questions → `/construction/terminal`
- Daily briefings → `/construction/morning-brief`
- Forward market questions → `/construction/forecast`
- Long-horizon structural questions → `/construction/migration-index`
- Cycle-risk questions → `/construction/stress-index` or `/construction/early-warning`
- Pricing-power questions → `/construction/power`
