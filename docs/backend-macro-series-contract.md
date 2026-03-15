# Backend contract: `GET /api/macro-series` (Construction Spending)

## Endpoint

- **Path**: `/api/macro-series`
- **Method**: `GET`
- **Query parameter**: `metric`
- **Supported metric values**: `construction_spending`

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
    "message": "Unsupported metric 'abi'. Supported metrics: construction_spending.",
    "metric": "abi",
    "supportedMetrics": ["construction_spending"]
  }
}
```

## Upstream mapping

For `metric=construction_spending`, upstream maps to:

- **Source**: Census Value of Construction Put in Place (VIP)
- **Frequency**: monthly
- **Unit returned to frontend**: `usd-billion`
- **Normalization rule**: if upstream points are in millions, divide by `1000` before returning.

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
- `value` is numeric and normalized to USD billions.
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

This repository does not currently run a server runtime. The implementation added for this contract is a backend-oriented route handler helper:

- `src/backend/macroSeries.ts`

Integrate this helper into your API runtime route (`GET /api/macro-series`) where your server framework parses query params and wires the upstream Census client.

Exact invocation shape:

```ts
const { status, body } = await getMacroSeriesResponse(
  { metric: request.query.metric },
  {
    fetchCensusVipSeries: () => censusClient.fetchVipSeries(),
    now: () => new Date(),
    cache: { hit: false, stale: false }
  }
)
```
