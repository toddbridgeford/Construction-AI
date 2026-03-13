'use client';

import { DashboardHeader } from '@/components/DashboardHeader';
import { EmptyStatePanel } from '@/components/EmptyStatePanel';
import { SegmentSignalTable } from '@/components/SegmentSignalTable';
import { SmallTrendChart } from '@/components/SmallTrendChart';
import { useAudienceMode } from '@/components/AppShell';
import { segmentCommentary, segmentSignals } from '@/data/segments';
import { trends } from '@/data/trends';
import { getAudienceFrame } from '@/lib/audience';

export default function SegmentMonitorPage() {
  const { mode } = useAudienceMode();
  const framing = getAudienceFrame(mode);

  return (
    <div className="space-y-5">
      <DashboardHeader title="Segment Monitor" subtitle={framing.soWhat} />

      {segmentSignals.length > 0 ? (
        <SegmentSignalTable signals={segmentSignals} />
      ) : (
        <EmptyStatePanel
          title="No segment signals available"
          detail="Mock segment data is missing. Add entries in data/segments.ts to render the monitor table."
        />
      )}

      {trends.segmentMomentum?.length ? (
        <SmallTrendChart data={trends.segmentMomentum} label="Segment Momentum (6M)" />
      ) : (
        <EmptyStatePanel
          title="No segment trend series available"
          detail="Mock trend data is missing. Add segmentMomentum in data/trends.ts to render trend chart."
        />
      )}

      <section className="rounded-2xl border border-white/10 bg-panel p-5 text-sm text-muted">{segmentCommentary}</section>
    </div>
  );
}
