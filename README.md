# Construction AI Terminal API (Cloudflare Worker)

Unified API gateway for FRED, Notion, Stooq, BLS, USAspending, Alpha Vantage, and RSS/Atom feed tape.

Base URL:

- `https://toddbridgeford.workers.dev`

## iPad-Friendly Setup

1. **Cloudflare: add Worker secrets**
   - `FRED_API_KEY`
   - `NOTION_TOKEN`
   - `ALPHAVANTAGE_API_KEY`
   - Optional: `BLS_API_KEY`

2. **Cloudflare: add Worker vars**
   - `NOTION_DATABASE_ID` (default `312f63a1aa6f80af91d7c019f1f2b53d`)
   - `CACHE_TTL_SECONDS` (default `300`)
   - `NEWS_FEEDS` (comma-separated RSS/Atom URLs)
   - Optional: `STOOQ_DEFAULT_TICKERS`

3. **Notion integration setup**
   1) Create an internal Notion integration.
   2) Share the **Construction AI** database with the integration with edit/insert permissions.
   3) Put the integration token into Cloudflare Worker secret `NOTION_TOKEN`.
   4) Ensure `Series ID` property is a **Select** property.

4. **Test URLs with curl**

```bash
curl "https://toddbridgeford.workers.dev/notion/series"

curl "https://toddbridgeford.workers.dev/bundle?limit=60"

curl "https://toddbridgeford.workers.dev/alphavantage/quote?symbol=IBM"

curl -X POST "https://toddbridgeford.workers.dev/usaspending/awards" \
  -H "content-type: application/json" \
  -d '{
    "filters": {
      "time_period": [{"start_date": "2025-01-01", "end_date": "2026-12-31"}],
      "naics_codes": ["236220"]
    },
    "fields": ["Award ID", "Recipient Name", "Award Amount", "Start Date"],
    "page": 1,
    "limit": 10,
    "sort": "Award Amount",
    "order": "desc"
  }'
```

5. **Custom GPT Actions**
   - Paste `docs/construction_ai_terminal_openapi.yaml` into your Custom GPT Actions schema.

## Routes

- `GET /health`
- `GET /notion/series`
- `POST /notion/add`
- `GET /bundle`
- `GET /fred/observations`
- `GET /stooq/quote`
- `POST /bls/timeseries`
- `POST /usaspending/awards`
- `POST /usaspending/awards/count`
- `GET /alphavantage/quote`
- `GET /alphavantage/daily`
- `GET /alphavantage/intraday`
- `GET /alphavantage/news`
- `GET /news/feeds`

## Notes

- Secrets are validated per route and return JSON `500` if missing.
- Worker never logs secrets.
- Caching uses Cloudflare `caches.default`, including stable POST cache keys via body hashing.
- Alpha Vantage rate-limit responses (`Note`/`Error Message`) are normalized to HTTP `429` and are not cached.
