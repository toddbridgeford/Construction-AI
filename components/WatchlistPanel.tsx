import { WatchItem } from '@/types';
import { TrendBadge } from '@/components/TrendBadge';

export function WatchlistPanel({ title, items }: { title: string; items: WatchItem[] }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-panel/75 p-5">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">{title}</h3>
      <div className="mt-3 grid gap-2.5 md:grid-cols-2">
        {items.map((item) => (
          <div key={item.item} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <p className="text-sm font-medium">{item.item}</p>
              <TrendBadge tone={item.tone} value={item.horizon} />
            </div>
            <p className="text-xs leading-relaxed text-muted">{item.implication}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
