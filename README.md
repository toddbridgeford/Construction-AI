# Construction AI Dashboard

Perplexity-style **U.S. construction intelligence dashboard** built with Next.js App Router, TypeScript, Tailwind CSS, and Recharts.

## Quick Start

### Prerequisites
- Node.js 18+ (recommended: 20 LTS)
- npm 9+

### Install
```bash
npm install
```

### Environment setup (required for secure live data)
1. Copy `.env.example` to `.env.local`.
2. Fill in server-side secrets (never use `NEXT_PUBLIC_` for these).

Required variables:
- `CENSUS_API_KEY`
- `BLS_API_KEY`
- `FRED_API_KEY`
- `EIA_API_KEY`

```bash
cp .env.example .env.local
```

### Run
```bash
npm run dev
```

Open: `http://localhost:3000`

### Production build check
```bash
npm run build
npm run start
```

## Security model
- All secret-backed requests run on the server (`app/api/dashboard/live`).
- Client components fetch only internal app routes; browser never calls secret-backed public APIs directly.
- Secret values are validated in `lib/server/env.ts` and never logged.
- `.gitignore` excludes `.env*` files and keeps only `.env.example` tracked.

## Routes
- `/` — U.S. Construction Market Dashboard
- `/segment-monitor`
- `/credit-risk`
- `/data-detail`

## Live source coverage (Phase 1)

| Indicator | Primary Source | Geography Coverage | Status |
|---|---|---|---|
| Housing starts / permits | Census (`resconst`) | US live, state map live for permits, region/metro derived fallback | Live + partial |
| Construction spending proxy | FRED (`TTLCONS`) | US live, map fallback for non-permits | Live + partial |
| Construction labor indicator | BLS (`CES2000000001`) then FRED fallback | US live, sub-US derived fallback | Live + partial |
| Mortgage rate proxy | FRED (`MORTGAGE30US`) | US live, sub-US fallback | Live + partial |
| Materials-cost indicator | EIA retail electricity price proxy then FRED fallback | US live, sub-US fallback | Live + partial |
| Residential proxy | FRED (`TLRESCONS`) | US live, sub-US fallback | Live + partial |

## Known limitations
- Some geography + indicator combinations are still fallback-derived where public sub-national series are not cleanly available.
- Forecast lines remain intentionally stubbed while historical layers are live-backed.
- If an upstream source is unavailable/rate-limited, API returns stable fallback payloads to keep UI interactive.

## Architecture overview

```text
app/
  api/dashboard/live/route.ts    # secure server endpoint for normalized dashboard data
components/
  PerplexityDashboard.tsx
  USStateChoropleth.tsx          # real SVG choropleth from state geometry
data/
lib/
  live-data.ts                   # source adapters (Census/BLS/FRED/EIA)
  dashboard-data.ts              # normalization + KPI/chart/map shaping
  use-live-dashboard.ts          # client fetch hook
  server/env.ts                  # typed server-only env validation
types/
  live-data.ts
```

## Scripts
- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run test`
