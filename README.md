# Construction AI Terminal API (Cloudflare Worker)

Unified API gateway + precomputed CPI engine for FRED, Notion, BLS, USAspending, Alpha Vantage, and RSS feeds.

Base URL:
- `https://toddbridgeford.workers.dev`

## Terminal Core Architecture

The Worker now supports:
- **Precompute on schedule** via `scheduled()` cron trigger.
- **Serve snapshots** instantly from KV:
  - `GET /cpi?location={market}`
  - `GET /market?location={market}`
  - `GET /rank/metros`
  - `GET /refresh?location={market}` (admin token required)

Snapshot KV keys:
- `cpi:{market}`
- `market:{market}`
- `leaderboard:metros`

All generated timestamps are UTC (`generated_at_utc`).

## Setup

1. **Create KV namespace and bind it**
   - Bind as `CPI_SNAPSHOTS` in `wrangler.toml`.

2. **Configure cron triggers**
   - Example included in `wrangler.toml`:
     - `0 * * * *` (hourly)
     - `15 12 * * *` (daily refresh)

3. **Set required secrets**
   - `NOTION_TOKEN` (for Notion routes and preferred market registry source)
   - `FRED_API_KEY` (if using FRED rows)
   - `ALPHAVANTAGE_API_KEY` (if using AlphaVantage rows)
   - `ADMIN_TOKEN` (required for `/refresh`)
   - Optional: `BLS_API_KEY`

4. **Set vars**
   - `NOTION_DATABASE_ID`
   - `MARKET_REGISTRY_NOTION_DATABASE_ID` (preferred registry db; falls back to `NOTION_DATABASE_ID`)
   - `MARKET_REGISTRY_JSON` (fallback JSON registry when Notion is unavailable)
   - `USASPENDING_QUERY_TEMPLATES_JSON` (query template map for USAspending registry keys)
   - `CACHE_TTL_SECONDS`
   - `SNAPSHOT_CONCURRENCY` (1-12)
   - `NEWS_FEEDS`
   - `OVERLAY_STOCK_SYMBOL` (optional temporary overlay)

## Market Registry Schema

Notion database should include:
- `Market` (select or text)
- `Provider` (select): `FRED | BLS | USAspending | AlphaVantage | RSS`
- `Key` (text)
- `Metric` (text)
- `Component` (select): `Capital | Pipeline | Trade | Materials | Regulatory | Macro`
- `Transform` (select): `level | pct_change | yoy`
- `Weight` (number)
- `Active` (checkbox)

If Notion fails/unavailable, Worker falls back to `MARKET_REGISTRY_JSON` with equivalent fields.

## Test URLs

```bash
curl "https://toddbridgeford.workers.dev/cpi?location=austin-tx"
curl "https://toddbridgeford.workers.dev/market?location=austin-tx"
curl "https://toddbridgeford.workers.dev/rank/metros"
curl "https://toddbridgeford.workers.dev/refresh?location=austin-tx&token=$ADMIN_TOKEN"
```

Legacy endpoints are preserved:
- `GET /notion/series`
- `POST /notion/add`
- `GET /bundle`
- `GET /fred/observations`
- `POST /bls/timeseries`
- `POST /usaspending/awards`
- `POST /usaspending/awards/count`
- `GET /alphavantage/quote`
- `GET /alphavantage/daily`
- `GET /alphavantage/intraday`
- `GET /alphavantage/news`
- `GET /news/feeds`
- `GET /stooq/quote`

## Notes

- CPI engine applies transforms, z-scores, score mapping (`50 + 50*tanh(z/2)`), component weighting, headline CPI, zone mapping, and `delta_3m`.
- Upstream failures degrade gracefully per datapoint (`provider_unavailable`) and pipeline continues.
- CORS remains permissive for Actions.
- Secrets are never returned in payloads.
