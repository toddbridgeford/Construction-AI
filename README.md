# Construction AI Terminal (Cloudflare Worker)

Bloomberg-style construction intelligence terminal deployed to:

- https://toddbridgeford.workers.dev

## Architecture

The worker uses a **snapshot architecture**:

1. `scheduled()` computes market intelligence for each market.
2. Snapshots are written to Cloudflare KV (`CPI_SNAPSHOTS`).
3. Read endpoints serve from KV for fast and stable responses.

KV keys:

- `cpi:{market}`
- `market:{market}`
- `leaderboard:metros`

Default fallback market registry:

- nashville
- austin
- dallas
- phoenix
- atlanta
- denver
- charlotte
- tampa

## API Endpoints

- `GET /health`
- `GET /cpi?location={market}`
- `GET /market?location={market}`
- `GET /rank/metros`
- `GET /refresh?location={market}`

Proxy endpoints used by computation:

- `GET /fred/observations`
- `POST /bls/timeseries`
- `POST /usaspending/awards`
- `GET /alphavantage/*`
- `GET /news/feeds`

## Cloudflare + GitHub Actions Setup

Required GitHub secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_KV_NAMESPACE_ID`
- `CLOUDFLARE_KV_PREVIEW_NAMESPACE_ID`

The deploy workflow fails fast with explicit errors when any of these are missing.

## Worker Runtime Variables / Secrets

Recommended runtime configuration:

- `FRED_API_KEY` (secret)
- `BLS_API_KEY` (optional secret)
- `ALPHAVANTAGE_API_KEY` (optional secret)
- `NEWS_FEEDS` (comma-separated RSS URLs, optional var)
- `MARKET_REGISTRY_JSON` (optional JSON list to override fallback markets)

## Deploy

GitHub Actions deploy command:

```bash
wrangler deploy --config wrangler.ci.toml
```

## OpenAPI

The GPT Actions schema is provided in:

- `openapi.yaml`
- `docs/construction_ai_terminal_openapi.yaml`
