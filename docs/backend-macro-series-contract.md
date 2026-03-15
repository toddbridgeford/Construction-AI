# Backend contract: `GET /api/macro-series` (Construction Spending activation)

## Audit result (this repository)

There is currently **no server runtime** in this repository implementing `/api/macro-series`.

Verified entrypoints in-repo are frontend-only:

- Vite app entry: `src/main.tsx`
- Frontend API client callsite: `src/api/client.ts` (`getMacroSeries`)
- Frontend normalization adapter: `src/providers/live/adapters/contractAdapters.ts` (`adaptMacroSeries`)
- Metric registry wiring: `src/lib/metricRegistry.ts`

No Node/Express server, serverless function directory, Cloudflare Worker, edge handler, or API route source for `/api/macro-series` exists in the current tree.

## Required endpoint

- **Path**: `/api/macro-series`
- **Method**: `GET`
- **Required query param**: `metric`
- **Supported value for this task**: `construction_spending`

### Optional query params

- `geographyId` (default `us`)
- `region` (default `us`)
- `horizon` (`3 | 6 | 12`, default `12`)

## Response shape (minimum compatible contract)

The frontend currently expects `MacroSeriesResponse` semantics and can also adapt legacy aliases (`points`, `data`). Preferred canonical response:

```json
{
  "meta": { "generatedAt": "2026-03-15T00:00:00.000Z", "mode": "live" },
  "region": "us",
  "sector": "permits",
  "horizon": 12,
  "metric": "construction_spending",
  "series": [
    { "date": "2024-01", "value": 2098.4, "yoy": 6.2, "mom": 0.4 },
    { "date": "2024-02", "value": 2105.1, "yoy": 6.0, "mom": 0.3 }
  ],
  "sourceStatus": "live"
}
```

### Required guarantees

- `series` contains monthly points with:
  - `date` in `YYYY-MM`
  - numeric `value`
- points are sorted ascending by `date`
- enough history to compute growth rates in UI logic (recommended: at least 24 monthly points; minimum 13 for YoY)

### Optional fields

- `yoy`, `mom` per row are optional and may be included by server.
- If omitted, the frontend can still operate from raw points.

## Upstream source mapping (server-side)

For `metric=construction_spending`, upstream should map to **U.S. Census Bureau Value of Construction Put in Place** monthly total construction spending (seasonally adjusted annual rate, nominal dollars).

Server responsibilities:

1. Fetch monthly source observations from Census endpoint configured by the backend environment.
2. Normalize each row to:
   - `date: YYYY-MM`
   - `value: number`
3. Drop invalid/non-numeric rows.
4. Sort ascending by month.
5. Return canonical envelope above.

## Error behavior (truthful runtime)

- `400` for missing/unsupported `metric`.
- `502` when upstream fails or returns unusable payload.
- `200` with `sourceStatus: "pending"` and empty series is acceptable only when backend intentionally signals onboarding state.

Example error payload:

```json
{
  "error": {
    "code": "UPSTREAM_UNAVAILABLE",
    "message": "Census construction spending source did not return usable monthly observations.",
    "metric": "construction_spending"
  }
}
```

## Adapter compatibility requirements

The current frontend adapter accepts these aliases for backwards compatibility:

- series arrays at `series`, `points`, or `data`
- date keys at `date`, `period`, or `month`
- values at `value`, `observation`, or `observation_value`

Backend should still emit canonical `series/date/value` to reduce ambiguity.
