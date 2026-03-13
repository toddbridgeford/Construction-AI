import { ExposureItem } from '@/types';
import { StatusChip } from '@/components/StatusChip';

export function ExposureTable({ items }: { items: ExposureItem[] }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-panel/75 p-4 md:p-5">
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Exposure Table</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left">
          <thead>
            <tr className="border-b border-white/10 text-[11px] uppercase tracking-[0.12em] text-muted">
              <th className="pb-2 font-medium">Exposure Area</th>
              <th className="pb-2 font-medium">Current Read</th>
              <th className="pb-2 font-medium">Main Watchpoint</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.area} className="border-b border-white/[0.06] align-top last:border-b-0">
                <td className="py-3.5 pr-4 text-sm font-medium">{item.area}</td>
                <td className="py-3.5 pr-4 text-sm">
                  <p className="mb-1.5 text-ink/90">{item.currentRead}</p>
                  <StatusChip tone={item.tone} text={item.tone} />
                </td>
                <td className="py-3.5 text-sm text-muted">{item.watchpoint}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
