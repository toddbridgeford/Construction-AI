# CPI Methodology

This file codifies the Construction Pressure Index (CPI) computation and regime logic used by dashboard generation.

## 1) CPI zones and rules

Headline CPI is a bounded 0-100 score.

- **Expansion:** `0-39`
- **Slowdown:** `40-49`
- **Stress:** `50-59`
- **Contraction:** `60-100`

Zone determines baseline regime label and informs default severity mapping.

## 2) Sub-indexes and weights

### Segment sub-indexes
- `cpi_sf` (single-family)
- `cpi_mf` (multi-family)
- `cpi_inst` (institutional)
- `cpi_infra` (infrastructure)

### Segment blend for segment basket
Use equal weights unless an override is explicitly configured in pipeline settings:

`segment_basket = 0.25*cpi_sf + 0.25*cpi_mf + 0.25*cpi_inst + 0.25*cpi_infra`

## 3) Rollups

- **CPI-R (Residential rollup):**
  - `cpi_r = 0.6*cpi_sf + 0.4*cpi_mf`
- **CPI-I (Institutional/Infra rollup):**
  - `cpi_i = 0.6*cpi_inst + 0.4*cpi_infra`
- **Headline CPI:**
  - `headline = 0.5*cpi_r + 0.5*cpi_i`

Round to nearest integer for UI cards, preserve decimal internally if needed.

## 4) Delta-3m momentum bands

`delta_3m = headline(t) - headline(t-3m)`

- `delta_3m <= -3`: **Cooling**
- `-2 <= delta_3m <= +2`: **Stable**
- `delta_3m >= +3`: **Heating**

## 5) Freeze Risk activation

Set `freeze_risk = true` when **any** of the following is met:
- `headline >= 58`
- `delta_3m >= +5`
- `capital <= 35 AND pipeline <= 42`
- `hy_oas trend = up` for 3 consecutive observations and `mortgage_30y trend = up`

Else `freeze_risk = false`.

## 6) Regime transition guardrails

- Regime flip requires either:
  1. Two consecutive runs crossing zone boundary, or
  2. One run crossing boundary with `confidence=high` and `delta_3m >= 4`.
- On flip, close prior regime entry and open new `Active` entry.
- Preserve history; never overwrite prior closed intervals.

