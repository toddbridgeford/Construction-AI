# Backend contract: `GET /api/macro-series` (Macro Metrics)

## Endpoint

- **Path**: `/api/macro-series`
- **Method**: `GET`
- **Query parameter**: `metric`
- **Supported metric values**: `construction_spending`, `abi`, `nahb_hmi`

## Request validation

- Missing `metric` returns `400` with a structured error payload.
- Unsupported `metric` returns `400` with:
  - `error.code = "UNSUPPORTED_METRIC"`
  - `error.metric`
  - `error.supportedMetrics`

Example:

```json
{
  "error": {
    "code": "UNSUPPORTED_METRIC",
    "message": "Unsupported metric 'unknown_metric'. Supported metrics: construction_spending, abi, nahb_hmi.",
    "metric": "unknown_metric",
    "supportedMetrics": ["construction_spending", "abi", "nahb_hmi"]
  }
}
```

## Upstream mapping

### `metric=construction_spending`

- **Source**: Census Value of Construction Put in Place (VIP)
- **Frequency**: monthly
- **Unit returned to frontend**: `usd-billion`
- **Normalization rule**: if upstream points are in millions, divide by `1000` before returning.

### `metric=abi`

- **Source**: AIA Architecture Billings Index
- **Frequency**: monthly
- **Unit returned to frontend**: `index`
- **Transform**: `diffusion` with `transformLabel: "diffusion vs 50 baseline"`
- **Truthfulness rule**: raw index values are returned; `mom`/`yoy` are left `null` to avoid implying growth semantics for diffusion indices.

### `metric=nahb_hmi`

- **Source**: NAHB / Wells Fargo Housing Market Index
- **Frequency**: monthly
- **Unit returned to frontend**: `index`
- **Transform**: `diffusion` with `transformLabel: "diffusion vs 50 baseline"`
- **Truthfulness rule**: raw index values are returned; `mom`/`yoy` are left `null` to avoid implying growth semantics for diffusion indices.

## Response schema (stable frontend contract)

```json
{
  "metric": "construction_spending",
  "unit": "usd-billion",
  "source": {
    "id": "census_vip",
    "label": "Census Value of Construction Put in Place",
    "frequency": "monthly",
    "unit": "usd-billion",
    "transformType": "direct",
    "transformLabel": "direct"
  },
  "sourceStatus": "live",
  "message": "Construction spending series loaded successfully.",
  "series": [
    {
      "date": "2025-03",
      "value": 2.124,
      "yoy": 5.2,
      "mom": 0.3
    }
  ],
  "asOf": "2026-03-15T16:30:00Z",
  "cache": {
    "hit": false,
    "stale": false
  }
}
```

### Guarantees

- `series` is always present (may be empty).
- `series` is sorted in ascending monthly order.
- `date` is normalized to `YYYY-MM`.
- `value` is numeric and normalized to the metric unit (`usd-billion` for construction spending, `index` for ABI/NAHB HMI).
- `yoy` and `mom` are derived server-side when history exists, otherwise `null`.

## Unavailable upstream behavior

If the Census VIP upstream is unavailable or returns no usable points:

- keep response truthful,
- return `sourceStatus` as `pending` or `error`,
- return `series: []`,
- include `message`.

Example:

```json
{
  "metric": "construction_spending",
  "unit": "usd-billion",
  "source": {
    "id": "census_vip",
    "label": "Census Value of Construction Put in Place",
    "frequency": "monthly",
    "unit": "usd-billion",
    "transformType": "direct",
    "transformLabel": "direct"
  },
  "sourceStatus": "error",
  "message": "Construction spending upstream request failed. No usable points were returned.",
  "series": [],
  "asOf": "2026-03-15T16:30:00Z",
  "cache": {
    "hit": false,
    "stale": false
  }
}
```

## Implementation notes

This repository exposes a runtime `/api/macro-series` route through the Vite server layer (`vite dev` + `vite preview`) and delegates request handling to:

- `src/backend/macroSeries.ts`

The route middleware in `vite.config.ts` parses `metric` query params and invokes the helper with metric-specific fetch dependencies (Census VIP, ABI, and NAHB HMI).

Exact invocation shape:

```ts
const { status, body } = await getMacroSeriesResponse(
  { metric: request.query.metric },
  {
    fetchCensusVipSeries: () => censusClient.fetchVipSeries(),
    fetchAbiSeries: () => abiClient.fetchSeries(),
    fetchNahbHmiSeries: () => nahbClient.fetchSeries(),
    now: () => new Date(),
    cache: { hit: false, stale: false }
  }
)
```
