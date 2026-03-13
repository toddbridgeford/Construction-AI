'use client';

import { createContext, useContext, useMemo, useState } from 'react';
import { SidebarNav } from '@/components/SidebarNav';
import { TopHeader } from '@/components/TopHeader';
import { AudienceMode } from '@/types';
import { referenceDate } from '@/data/dashboard';

const AudienceContext = createContext<{ mode: AudienceMode; setMode: (mode: AudienceMode) => void } | null>(null);

export function useAudienceMode() {
  const value = useContext(AudienceContext);
  if (!value) {
    throw new Error('useAudienceMode must be used inside AppShell');
  }
  return value;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<AudienceMode>('Lender / Investor');
  const contextValue = useMemo(() => ({ mode, setMode }), [mode]);

  return (
    <AudienceContext.Provider value={contextValue}>
      <div className="min-h-screen bg-bg text-ink md:flex">
        <SidebarNav />
        <main className="flex-1 px-4 pb-8 pt-4 md:px-8 md:pb-10 md:pt-7">
          <TopHeader referenceDate={referenceDate} mode={mode} onModeChange={setMode} />
          <div className="mt-6">{children}</div>
        </main>
      </div>
    </AudienceContext.Provider>
  );
}
