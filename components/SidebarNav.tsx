'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Route } from 'next';

const nav: Array<{ href: Route; label: string }> = [
  { href: '/', label: 'Executive Dashboard' },
  { href: '/segment-monitor', label: 'Segment Monitor' },
  { href: '/credit-risk', label: 'Credit / Risk View' },
  { href: '/data-detail', label: 'Data Detail View' }
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <aside className="w-full border-b border-white/10 bg-panel/50 p-4 backdrop-blur md:h-screen md:w-64 md:border-b-0 md:border-r md:p-6">
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted">Construction AI</p>
      <h1 className="mt-1 text-sm font-semibold text-ink">Institutional Dashboard</h1>
      <nav className="mt-6 space-y-1.5">
        {nav.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-xl px-3 py-2.5 text-sm transition ${
                active
                  ? 'border border-accent/35 bg-accent/[0.08] text-ink'
                  : 'border border-transparent text-muted hover:border-white/10 hover:bg-white/[0.03] hover:text-ink'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
