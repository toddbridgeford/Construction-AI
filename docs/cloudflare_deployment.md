# Cloudflare Worker Deployment Checklist

This repository includes a deployable Cloudflare Worker at `src/worker.js` with configuration in `wrangler.toml`.

## What was added

- `wrangler.toml` with a Worker entrypoint and compatibility date
- `.dev.vars.example` for local secret/environment setup
- `.github/workflows/deploy_cloudflare_worker.yml` for GitHub Actions deployment

## Required GitHub Secrets

Add these in **Repository Settings → Secrets and variables → Actions**:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

## Optional Worker Runtime Secrets

Set in Cloudflare dashboard or with `wrangler secret put`:

- `FRED_API_KEY`
- `BLS_API_KEY`
- `CENSUS_API_KEY`
- `EIA_API_KEY`
- `ALPHAVANTAGE_API_KEY`
- `NEWS_API_KEY`

## Local validation

```bash
node --check src/worker.js
```

## Cloudflare deployment paths

The deployment workflow triggers on changes to:

- `src/worker.js`
- `wrangler.toml`
- `.github/workflows/deploy_cloudflare_worker.yml`

This keeps deployment scope aligned to actual Worker/runtime configuration updates.
