'use client';

import { useEffect, useState } from 'react';
import { GeographyLevel, IndicatorKey, NormalizedDataset } from '@/types/live-data';

type State = {
  data: NormalizedDataset | null;
  loading: boolean;
  error: string | null;
};

export function useLiveDashboardData(params: {
  geographyLevel: GeographyLevel;
  region: string;
  state: string;
  metro: string;
  indicator: IndicatorKey;
}) {
  const [state, setState] = useState<State>({ data: null, loading: true, error: null });

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      const query = new URLSearchParams({
        geography: params.geographyLevel,
        region: params.region,
        state: params.state,
        metro: params.metro,
        indicator: params.indicator
      });

      try {
        const response = await fetch(`/api/dashboard/live?${query.toString()}`, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`Live endpoint failed with ${response.status}`);
        }
        const data = (await response.json()) as NormalizedDataset;
        setState({ data, loading: false, error: null });
      } catch (error) {
        if (controller.signal.aborted) return;
        setState({ data: null, loading: false, error: error instanceof Error ? error.message : 'Failed to load live data.' });
      }
    }

    void load();
    return () => controller.abort();
  }, [params.geographyLevel, params.region, params.state, params.metro, params.indicator]);

  return state;
}
