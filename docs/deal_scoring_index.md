# Construction AI Deal Scoring Index (DSI 0-100)

This model adds:

- Developer/owner relationship graph modeling.
- Subcontractor capacity risk mapping.
- A deterministic Bid / No Bid decision engine.

## Files

- Model: `framework/deal_scoring_engine_v1.json`
- Sample opportunities input: `config/deal_opportunities_sample.json`
- Builder script: `scripts/build_deal_scoring_latest.mjs`
- Output artifact: `deal_scoring_latest.json`

## How scoring works

Each deal is scored across weighted components:

- `strategic_fit`
- `relationship_graph`
- `subcontractor_capacity_health`
- `market_timing`
- `margin_potential`
- `execution_readiness`
- `risk_penalty` (negative weight)

The final DSI score is clamped to 0-100.

## Relationship graph

A weighted graph score is calculated from edges:

- `developer_to_owner`
- `contractor_to_owner`
- `contractor_to_developer`

Each edge score is reduced by a staleness penalty based on the last active month.

## Subcontractor capacity risk

Trade utilization is mapped to a normalized risk curve and weighted by trade criticality:

- `electrical`
- `mechanical`
- `civil`
- `steel`
- `finishes`

Output includes both:

- `subcontractor_capacity_health` (higher is better)
- `subcontractor_capacity_risk` (higher is worse)

## Decision engine

Decision bands:

- `Bid`: 70-100
- `Conditional Bid`: 55-69
- `No Bid`: 0-54

Hard-stop `No Bid` rules override bands when any threshold is breached:

- DSI <= configured floor.
- Subcontractor capacity risk >= configured ceiling.
- Owner relationship score <= configured floor.

## Run

```bash
node scripts/build_deal_scoring_latest.mjs
```

Optional overrides:

- `MODEL_PATH`
- `DEALS_PATH`
- `CONTRACTORS_PATH`
- `BIDS_PATH`
- `OUT_PATH`
