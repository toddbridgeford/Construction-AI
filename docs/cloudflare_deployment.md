# Cloudflare Worker Deployment Checklist

This repo deploys a Cloudflare Worker from `src/worker.js` via `wrangler.toml`.

## Required Worker secrets

Set via Cloudflare dashboard or `wrangler secret put`:

- `FRED_API_KEY`
- `NOTION_TOKEN`
- `ALPHAVANTAGE_API_KEY`
- Optional: `BLS_API_KEY`

## Worker vars

Set in Worker settings:

- `NOTION_DATABASE_ID` (default: `312f63a1aa6f80af91d7c019f1f2b53d`)
- `CACHE_TTL_SECONDS` (default: `300`)
- `NEWS_FEEDS` (comma-separated RSS/Atom URLs)
- Optional: `STOOQ_DEFAULT_TICKERS`

## Notion integration setup

1. Create an internal Notion integration.
2. Share the **Construction AI** database with this integration with edit/insert permissions.
3. Add the integration token as Worker secret `NOTION_TOKEN`.
4. Confirm `Series ID` is a **Select** property in the database.

## Local checks

```bash
node --check src/worker.js
```

## Deployment workflow

`.github/workflows/deploy_cloudflare_worker.yml` deploys on relevant Worker config/source changes.
