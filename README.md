# Construction AI Dashboard

## Provider selection (demo vs live)

The dashboard uses a provider factory (`createDataProvider`) to select the data source at runtime:

- **Demo/local mode** (default): uses `LocalJsonProvider` and synthetic/local JSON data.
- **Live mode**: enabled when `VITE_API_BASE_URL` is configured.

Selection logic lives in `src/providers/providerFactory.ts`.

## Environment variables

Set these in your `.env` file for live mode:

- `VITE_API_BASE_URL` (required for live mode)
- `VITE_API_KEY` (optional bearer token for your server-side proxy)

The client only calls your server-side layer (`VITE_API_BASE_URL`) and does not call upstream vendor APIs directly.

## PWA behavior

- Manifest: `public/manifest.webmanifest`
- Service worker: `public/sw.js` (registered from `src/main.tsx`)
- Installability: app declares standalone display, theme color, and icon metadata.
- Offline/degraded mode: app shell is precached, data calls use network-first with cache fallback, and dashboard data also falls back to a cached snapshot in `localStorage`.

## Live data adapters and normalization

`ApiProvider` fetches source payloads and normalizes into the dashboard's internal typed shape (`DashboardData`):

- metadata
- observations
- map values
- forecast inputs

Adapters currently included:

- `fredAdapter` (wired; supports permits + 30Y mortgage series via configured source indicator)
- `blsAdapter` (wired for construction employment)
- `censusAdapter` (wired for starts and state map permit rows)
- `HUD` scaffold adapter (structure only)
- `BEA` scaffold adapter (structure only)

## Resilience and fallback behavior

- Live calls are fetched independently.
- Any failed source degrades gracefully without crashing the app.
- The provider merges successful live payloads with local baseline data.
- If live payloads produce no usable rows, the app remains effectively in demo-backed mode.
- Forecasting continues running because normalized live series map into the same internal shape.


## Macro series backend contract (Construction Spending first live target)

When `VITE_API_BASE_URL` is set, the dashboard requests macro metrics from:

- `GET {VITE_API_BASE_URL}/api/macro-series?metric=construction_spending`

The client now treats Construction Spending as **runtime-live capable** only when the response contains usable series points. Supported response payload shapes are intentionally minimal and typed:

```json
{
  "metric": "construction_spending",
  "series": [{ "date": "2025-01", "value": 2145.3 }],
  "sourceStatus": "live"
}
```

Also accepted for compatibility:

- `points` or `data` arrays instead of `series`
- `period`/`month` instead of `date`
- numeric strings (e.g. `"2,145.3"`) for values

If no usable points are returned, the metric remains **Onboarding** (pending) and is excluded from composite inclusion. If a previously fetched real payload is available in cache while offline, it is surfaced as an offline snapshot via freshness metadata without synthesizing values.


## Server-side implementation status (current repo audit)

- `/api/macro-series` handler logic lives at `src/backend/macroSeries.ts`.
- The route is mounted in the in-repo runtime via `vite.config.ts` for both `vite dev` and `vite preview`.
- Runtime path wiring now:
  1. Parse `metric` query from `GET /api/macro-series`.
  2. Use `getMacroSeriesResponse({ metric }, deps)` with `fetchCensusVipSeries` dependency.
  3. Return the helper's `{ status, body }` response directly as JSON.
- By default, missing `CENSUS_VIP_API_URL` returns an empty upstream payload and truthful `sourceStatus: "pending"`.
- A concrete backend implementation contract for Construction Spending is documented in `docs/backend-macro-series-contract.md`.

## Known limitations

- Endpoint paths are assumed as `/fred`, `/bls`, `/census`, `/hud`, `/bea` under `VITE_API_BASE_URL`.
- Server-side route behavior is expected to support query parameters for series routing (e.g. FRED `series_id`).
- HUD/BEA adapters are scaffolded but not endpoint-specific yet.
