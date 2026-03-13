'use client';

import { AudienceModeToggle } from '@/components/AudienceModeToggle';
import { AudienceMode } from '@/types';

export function TopHeader({ referenceDate, mode, onModeChange }: { referenceDate: string; mode: AudienceMode; onModeChange: (mode: AudienceMode) => void }) {
  return (
    <header className="border-b border-white/10 pb-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted">Construction Intelligence Terminal</p>
          <p className="mt-1 text-xs text-muted/90">Reference date: {referenceDate} · Mock sample series for product development</p>
        </div>
        <AudienceModeToggle value={mode} onChange={onModeChange} />
      </div>
    </header>
  );
}
