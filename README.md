# Construction AI Dashboard

## Provider selection (demo vs live)

The dashboard now uses a provider factory (`createDataProvider`) to select the data source at runtime:

- **Demo/local mode** (default): uses `LocalJsonProvider` and synthetic/local JSON data.
- **Live mode**: enabled when `VITE_API_BASE_URL` and at least one API key are configured.

Selection logic lives in `src/providers/providerFactory.ts`.

## Environment variables

Set these in your `.env` file for live mode:

- `VITE_API_BASE_URL` (required for live mode)
- `VITE_API_KEY` (optional global fallback key)
- `VITE_FRED_API_KEY`
- `VITE_BLS_API_KEY`
- `VITE_CENSUS_API_KEY`
- `VITE_HUD_API_KEY`
- `VITE_BEA_API_KEY`

If missing or incomplete, the app remains in **Demo Mode** and keeps full dashboard functionality.

## Live data adapters and normalization

`ApiProvider` fetches source payloads and normalizes into the dashboard's internal typed shape (`DashboardData`):

- metadata
- observations
- series-compatible observation points
- KPI-compatible values
- map values
- forecast inputs
- insight inputs

Adapters currently included:

- `fredAdapter` (wired)
- `blsAdapter` (wired)
- `censusAdapter` (wired, including map patches when available)
- `mortgageAdapter` (wired for Freddie Mac / mortgage-compatible shape)
- `HUD` scaffold adapter (structure only)
- `BEA` scaffold adapter (structure only)

## Resilience and fallback behavior

- Live calls are fetched independently.
- Any failed source degrades gracefully without crashing the app.
- The provider merges successful live payloads with local baseline data.
- If live payloads produce no usable rows, the app remains effectively in demo-backed mode.
- Forecasting and insights continue running because normalized live series are mapped into the same internal series shape.

## Live mode UX

The header includes a subtle premium status chip:

- **Live Data** when normalized live rows are available.
- **Demo Mode** when local fallback is active.

A lightweight status line under the header communicates degraded-mode details when needed.

## Known limitations

- Endpoint paths are currently assumed as `/fred`, `/bls`, `/census`, `/mortgage`, `/hud`, `/bea` under `VITE_API_BASE_URL`.
- HUD/BEA adapters are scaffolded but not endpoint-specific yet.
- Indicator mapping for live sources is currently fixed to existing dashboard IDs (`permits`, `employment`, `starts`, `cost_index`) and may need expansion as additional series are onboarded.
