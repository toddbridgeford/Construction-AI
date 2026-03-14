# Live Data Migration Guide

This dashboard currently reads mock fixtures from `data/`. Use this guide to transition to live APIs while keeping UI behavior stable.

## 1. Inventory all mock data entry points

1. Find imports from `@/data/*` in `app/` and `components/`.
2. Group these imports by route so each page has an API migration plan.
3. Keep shape parity between mock and live responses during rollout.

## 2. Choose a fetch strategy: SWR vs React Query

Both work in Next.js App Router (Next.js 15 + React 19). Pick one globally to keep cache behavior predictable.

### Option A: SWR (lightweight)

Use when reads dominate and mutation workflows are limited.

```tsx
'use client';

import useSWR from 'swr';

const fetcher = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json() as Promise<T>;
};

export function useDashboardSummary() {
  return useSWR('/api/dashboard/summary', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000
  });
}
```

### Option B: React Query (heavier, richer)

Use when you need robust mutation, optimistic updates, and invalidation rules.

```tsx
'use client';

import { useQuery } from '@tanstack/react-query';

async function getSummary() {
  const res = await fetch('/api/dashboard/summary');
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

export function useDashboardSummaryQuery() {
  return useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: getSummary,
    staleTime: 60_000
  });
}
```

## 3. Type alignment checklist (critical)

1. Create API DTO types in `types/` next to domain models.
2. Add explicit mapping functions from DTO → UI model.
3. Keep `SignalTone` and other unions strict; map unknown backend values to a safe default (`neutral`).
4. Validate optional fields (`note`, `trendKey`, etc.) before rendering.
5. Prefer `zod` or hand-written guards if payload shape can drift.

Example mapping pattern:

```ts
import { KPIGroup } from '@/types';

interface KPIGroupDto {
  id: string;
  title: string;
  items: Array<{
    metric: string;
    latest: string;
    mom: string;
    yoy: string;
    takeaway: string;
    tone?: string;
  }>;
}

const normalizeTone = (tone?: string): KPIGroup['items'][number]['tone'] => {
  if (tone === 'positive' || tone === 'neutral' || tone === 'caution' || tone === 'negative') {
    return tone;
  }
  return 'neutral';
};

export function mapKpiGroup(dto: KPIGroupDto): KPIGroup {
  return {
    id: dto.id,
    title: dto.title,
    items: dto.items.map((item) => ({
      metric: item.metric,
      latest: item.latest,
      mom: item.mom,
      yoy: item.yoy,
      takeaway: item.takeaway,
      tone: normalizeTone(item.tone)
    }))
  };
}
```

## 4. Migration flow per route

1. Keep existing mock import as fallback.
2. Add hook (`useSWR` or `useQuery`) and loading/error states.
3. Render fallback mock data only when API data is unavailable.
4. Gate route rollout behind a feature flag when possible.

## 5. Error handling + resilience

- Always branch for loading, error, and empty states.
- Display actionable messages in `EmptyStatePanel`.
- Log API failures with route + query context.
- Avoid blocking the full page when one panel fails; degrade panel-by-panel.

## 6. Verification checklist

- `npm run build` passes with live-fetch hooks included.
- `npm run test` passes for baseline component smoke coverage.
- Error state manually validated (simulate 500 / malformed payload).
- TypeScript checks remain strict with no `any` backdoors.

## 7. Suggested file layout

```text
lib/api/
  client.ts          # shared fetch wrapper
  dashboard.ts       # endpoint-specific calls
lib/mappers/
  dashboard.ts       # DTO -> UI model conversion
types/
  api.ts             # raw backend DTO types
  index.ts           # UI/domain types
```

This structure keeps API contracts isolated so UI components can remain mostly unchanged while data sources move from mock fixtures to real services.
