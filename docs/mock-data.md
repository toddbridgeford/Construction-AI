# Mock Data Note

This dashboard uses **mock/sample data** in all views.

## Why
- Enable fast UI iteration and review before API integration.
- Keep component contracts stable while data sources are still evolving.

## Where mock data lives
- `data/dashboard.ts`
- `data/segments.ts`
- `data/exposures.ts`
- `data/trends.ts`
- `data/detailMetrics.ts`
- `data/audienceModes.ts`

## Integration readiness
The data layer is typed and structured for API replacement. When live sources are introduced, keep output shapes compatible with `types/index.ts` to minimize UI churn.
