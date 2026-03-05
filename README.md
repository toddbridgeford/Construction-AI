# Construction AI Dashboard Pipeline

This repo now includes a **Bloomberg-terminal-style dashboard pipeline** designed for Cloudflare free-tier hosting and iPad-friendly viewing.

## Project Structure

- `cloudflare/worker/` → TypeScript Worker API + scheduled data refresh + KV persistence.
- `dashboard/` → static dashboard site for Cloudflare Pages.
- Existing repo workflows and historical scripts remain intact.

## Normalized API Schema

`GET /api/dashboard` returns:

```json
{
  "generated_at": "2026-03-04T12:00:00.000Z",
  "tickers": [{ "symbol": "SPY", "price": 0, "change": 0, "changePct": 0 }],
  "news": [{ "title": "", "source": "", "url": "", "publishedAt": "" }],
  "construction": [{ "title": "", "value": "", "source": "" }],
  "signals": [{ "name": "", "value": "", "direction": "up" }]
}
```

## Worker Endpoints

- `GET /api/health`
- `GET /api/dashboard`

Worker behavior:

- Uses providers to fetch ticker/news data.
- Merges into normalized schema.
- Persists latest snapshot + history ring in KV.
- Runs scheduled refresh every 15 minutes (cron).
- Returns CORS-enabled JSON responses.

## Cloudflare Setup

### 1) Create KV namespace

```bash
wrangler kv namespace create DASHBOARD_KV
wrangler kv namespace create DASHBOARD_KV --preview
```

Copy IDs into `cloudflare/worker/wrangler.toml`.

### 2) Install dependencies

```bash
cd cloudflare/worker
npm install
```

### 3) Set secrets/vars (never commit real keys)

```bash
wrangler secret put NEWSAPI_KEY
wrangler secret put ALPHAVANTAGE_API_KEY
```

Optional vars:

```bash
wrangler secret put SYMBOLS
wrangler secret put HISTORY_LIMIT
wrangler secret put ALLOWED_ORIGIN
```

For local development only, start from `cloudflare/worker/.env.example`.

### 4) Deploy Worker

```bash
wrangler deploy
```

### 5) Create Cloudflare Pages project from `/dashboard`

- Framework preset: **None**
- Build command: *(none)*
- Output directory: `/`
- Root directory: `dashboard`

### 6) Set Worker route

Use either:

- Dedicated API domain, e.g. `https://api.example.com/api/*`
- Same-site route via Cloudflare custom domains.

Dashboard fetch target is `GET /api/dashboard` (or `window.DASHBOARD_API_BASE + /api/dashboard`).

### 7) Enable cron triggers

`cloudflare/worker/wrangler.toml` includes:

```toml
[triggers]
crons = ["*/15 * * * *"]
```

## Dashboard Runtime

The dashboard automatically:

- refreshes every 60 seconds
- supports manual refresh button
- renders graceful empty states if any panel is missing data

## Local Development

Run Worker locally:

```bash
cd cloudflare/worker
npm run dev
```

Run static dashboard locally:

```bash
cd dashboard
npm run dev
```

## Minimal Validation

```bash
cd cloudflare/worker
npm test
```

This sanity-checks normalized payload shape expectations.

## Construction AI Terminal Worker (Production)

Base URL: `https://construction-ai-terminal.toddbridgeford.workers.dev`

Implemented endpoints:

- `GET /`
- `GET /health`
- `GET /notion/series`
- `GET /fred/observations`
- `GET /bundle`
- `GET /cpi`

Required Worker environment variables:

- `NOTION_TOKEN` (secret)
- `NOTION_DATABASE_ID` (plaintext)
- `FRED_API_KEY` (secret)

Optional Worker variable:

- `CACHE_TTL_SECONDS`

### Setup checklist

1. Confirm `wrangler.toml` name is `construction-ai-terminal` and `main` points to `src/worker.js`.
2. Set required Cloudflare Worker variables and secrets.
3. Deploy the `Predictive-Model` branch to production in Cloudflare.
4. Validate endpoints using the commands below.

### Validation commands

```bash
curl -s https://construction-ai-terminal.toddbridgeford.workers.dev/ | jq
curl -s https://construction-ai-terminal.toddbridgeford.workers.dev/health | jq
curl -s https://construction-ai-terminal.toddbridgeford.workers.dev/notion/series | jq
curl -s "https://construction-ai-terminal.toddbridgeford.workers.dev/fred/observations?series_id=PERMIT&limit=10" | jq
curl -s "https://construction-ai-terminal.toddbridgeford.workers.dev/bundle?limit=10" | jq
curl -s https://construction-ai-terminal.toddbridgeford.workers.dev/cpi | jq
```
