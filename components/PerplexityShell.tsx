'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Route } from 'next';

const tabs: Array<{ href: Route; label: string }> = [
  { href: '/', label: 'Dashboard' },
  { href: '/segment-monitor', label: 'Segment Monitor' },
  { href: '/credit-risk', label: 'Credit / Risk' },
  { href: '/data-detail', label: 'Data Detail' }
];

export function PerplexityShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto w-full max-w-[1460px] px-4 pb-8 pt-5 md:px-6 lg:px-8">
        <header className="rounded-2xl border border-white/10 bg-[#0f1728] px-4 py-3 shadow-panel md:px-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Construction AI</p>
              <h1 className="mt-1 text-lg font-semibold text-slate-100 md:text-xl">U.S. Construction Market</h1>
            </div>
            <button className="rounded-md border border-white/15 bg-white/[0.03] px-3 py-1.5 text-xs text-slate-200">Export</button>
          </div>
          <nav className="mt-3 flex flex-wrap gap-2 border-t border-white/10 pt-3">
            {tabs.map((tab) => {
              const active = pathname === tab.href;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`rounded-md px-3 py-1.5 text-xs transition ${
                    active
                      ? 'border border-cyan-400/45 bg-cyan-400/15 text-cyan-100'
                      : 'border border-white/10 bg-white/[0.02] text-slate-300 hover:bg-white/[0.05]'
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </header>
        <main className="mt-4">{children}</main>
      </div>
    </div>
  );
}
