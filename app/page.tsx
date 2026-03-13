'use client';

import { BottomLinePanel } from '@/components/BottomLinePanel';
import { EmptyStatePanel } from '@/components/EmptyStatePanel';
import { ExecutiveBriefBand } from '@/components/ExecutiveBriefBand';
import { KPIGroupTable } from '@/components/KPIGroupTable';
import { WatchlistPanel } from '@/components/WatchlistPanel';
import { useAudienceMode } from '@/components/AppShell';
import { bottomLine, headline, kpiGroups, referenceDate, watchlist } from '@/data/dashboard';
import { frameWatchlistForAudience, getAudienceFrame } from '@/lib/audience';

export default function HomePage() {
  const { mode } = useAudienceMode();
  const framing = getAudienceFrame(mode);
  const hasKpiGroups = kpiGroups.length > 0;
  const audienceWatchlist = frameWatchlistForAudience(watchlist, mode);

  return (
    <div className="space-y-6">
      <ExecutiveBriefBand
        title={`Construction AI Dashboard | ${referenceDate}`}
        signal={headline}
        framing={framing}
        bottomLine={`${framing.soWhat} ${bottomLine}`}
      />

      {hasKpiGroups ? (
        <div className="space-y-4">
          {kpiGroups.map((group) => (
            <KPIGroupTable key={group.id} group={group} />
          ))}
        </div>
      ) : (
        <EmptyStatePanel
          title="No KPI groups available"
          detail="Mock KPI group data is missing. Add entries in data/dashboard.ts to render section tables."
        />
      )}

      {audienceWatchlist.length > 0 ? (
        <WatchlistPanel title={framing.watchLabel} items={audienceWatchlist} />
      ) : (
        <EmptyStatePanel
          title="No watchlist items available"
          detail="Mock watchlist data is missing. Add entries in data/dashboard.ts to render 90-day watch items."
        />
      )}
      <BottomLinePanel text={`${framing.bottomLineLead} ${framing.soWhat}`} />
    </div>
  );
}
