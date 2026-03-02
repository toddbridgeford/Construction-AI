# Dashboard Contract (Canonical UI Truth)

This document defines the JSON behavior expected by the iPad Swift Playgrounds dashboard client and any GPT/Notion automation that emits `dashboard_latest.json`.

## 1) Envelope

- **Required root fields:** `schema_version`, `generated_at`, `executive`, `cpi`, `volatility_regime`, `regime_history`, `regime_history_display`, `ui`.
- **Schema source of truth:** `contracts/dashboard_schema.json`.
- **Versioning:** bump `schema_version` as semver when field contracts change.

## 2) Section contracts

### `executive`
- `headline`: non-empty string.
- `confidence`: one of `low|medium|high`.
- `summary`: concise non-empty string.

### `cpi`
- `headline`: 0-100.
- `zone`: CPI zone label from methodology.
- `delta_3m`: signed 3-month change in points.
- `momentum`: `Cooling|Stable|Heating`.
- `history`: ordered date/value points.
- `components`: six mandatory 0-100 component scores.

### `regime_history`
Each row tracks a regime interval:
- `date`, `primary_regime`, `secondary_modifier`, `confidence`, `cpi_level`, `capital_score`, `pipeline_score`, `flip_trigger`, `duration_days`, `status`.
- `status` is `Active` or `Closed`.

### `ui`
- `alerts`: array of alert banners.
- `trends`: directional arrows/symbols for key metrics.
- `cards`: KPI cards shown on dashboard.
- `heat_strip`: compact strip with CPI/momentum/freeze risk state.

## 3) Severity taxonomy for UI

Allowed severity levels:
- `WATCH`
- `MONITOR`
- `ELEVATED`
- `HIGH`
- `CRITICAL`

Mapping and semantics are defined in `contracts/severity_taxonomy.json`.

## 4) Trend arrow rules

For all directional UI trend fields:
- `↑` if metric increased above positive threshold.
- `↓` if metric decreased below negative threshold.
- `→` if absolute change is inside neutral threshold.

Default neutral threshold unless metric-specific override exists: `abs(change) < 0.5`.

## 5) CPI and risk mode thresholds

- **Headline CPI zones:**
  - `0-39`: Expansion
  - `40-49`: Slowdown
  - `50-59`: Stress
  - `60-100`: Contraction
- **Risk mode activation:** CPI >= 55 OR Freeze Risk = true.
- **Risk thermometer mode:** CPI >= 60 OR (`delta_3m` >= 6 and headline >= 52).

## 6) Compatibility defaults (defensive decoding)

If optional fields are missing, consumers should default safely:
- Missing overlays => `0`.
- Missing `regime_history_display` values => null-safe placeholders.
- Missing trend symbols => `→` with `arrow.right`.
- Missing card severity => `MONITOR`.

