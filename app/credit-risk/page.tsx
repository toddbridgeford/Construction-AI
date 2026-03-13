'use client';

import { BottomLinePanel } from '@/components/BottomLinePanel';
import { DashboardHeader } from '@/components/DashboardHeader';
import { EmptyStatePanel } from '@/components/EmptyStatePanel';
import { ExposureTable } from '@/components/ExposureTable';
import { WatchlistPanel } from '@/components/WatchlistPanel';
import { useAudienceMode } from '@/components/AppShell';
import { creditBottomLine, creditWatch, exposures } from '@/data/exposures';
import { frameWatchlistForAudience, getAudienceFrame } from '@/lib/audience';

export default function CreditRiskPage() {
  const { mode } = useAudienceMode();
  const framing = getAudienceFrame(mode);
  const audienceWatch = frameWatchlistForAudience(creditWatch, mode);

  return (
    <div className="space-y-5">
      <DashboardHeader title="Credit / Risk View" subtitle={`${framing.heading} ${framing.soWhat}`} />

      {exposures.length > 0 ? (
        <ExposureTable items={exposures} />
      ) : (
        <EmptyStatePanel
          title="No exposure table data available"
          detail="Mock exposure data is missing. Add entries in data/exposures.ts to render this section."
        />
      )}

      {audienceWatch.length > 0 ? (
        <WatchlistPanel title={`${framing.watchLabel} · Surveillance`} items={audienceWatch} />
      ) : (
        <EmptyStatePanel
          title="No surveillance items available"
          detail="Mock watch items are missing. Add entries in data/exposures.ts to render surveillance watchlist."
        />
      )}

      <BottomLinePanel text={`${framing.bottomLineLead} ${creditBottomLine}`} />
    </div>
  );
}
