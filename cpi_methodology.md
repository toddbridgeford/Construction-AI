# CPI Methodology

## Objective

The Construction Pressure Index (CPI) converts multiple macro and construction-specific inputs into a bounded `0..100` pressure score.

## Formula

`headline_cpi = round(sum(weight_i * component_i))`

Default component weights:

- Capital: `0.25`
- Pipeline: `0.20`
- Trade: `0.15`
- Materials: `0.15`
- Regulatory: `0.10`
- Macro Sentiment: `0.15`

Weights should sum to `1.00`.

## Zones

- `0..34` → `Expansion`
- `35..59` → `Slowdown`
- `60..100` → `Stress`

## Momentum classification

Using current value and a trailing 3-month comparison (`delta_3m`):

- `delta_3m >= 5` → `Accelerating`
- `delta_3m <= -5` → `Cooling`
- otherwise → `Stable`

## Defensive handling

- Missing component scores must default to the prior valid value when available.
- If no prior value exists, default to `50` and emit an alert.
- Clamp every component and final headline CPI to `0..100`.
