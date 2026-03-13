'use client';

import { DashboardHeader } from '@/components/DashboardHeader';
import { DetailMetricPanel } from '@/components/DetailMetricPanel';
import { EmptyStatePanel } from '@/components/EmptyStatePanel';
import { useAudienceMode } from '@/components/AppShell';
import { detailMetrics } from '@/data/detailMetrics';
import { trends } from '@/data/trends';
import { getAudienceFrame } from '@/lib/audience';

export default function DataDetailPage() {
  const { mode } = useAudienceMode();
  const framing = getAudienceFrame(mode);

  return (
    <div className="space-y-5">
      <DashboardHeader
        title="Data Detail View"
        subtitle={`Current conditions and measured reads. Forecast interpretation remains conditional. ${framing.soWhat}`}
      />
      {detailMetrics.length > 0 ? (
        detailMetrics.map((metric) => (
          <DetailMetricPanel key={metric.id} metric={metric} trend={metric.trendKey ? trends[metric.trendKey] : undefined} />
        ))
      ) : (
        <EmptyStatePanel
          title="No detail metrics available"
          detail="Mock metric metadata is missing. Add entries in data/detailMetrics.ts to render drill-down panels."
        />
      )}
    </div>
  );
}
