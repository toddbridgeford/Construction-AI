import { KPIGroup } from '@/types';
import { StatusChip } from '@/components/StatusChip';

export function KPIGroupTable({ group }: { group: KPIGroup }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-panel/75 p-4 md:p-5">
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">{group.title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left">
          <thead>
            <tr className="border-b border-white/10 text-[11px] uppercase tracking-[0.12em] text-muted">
              <th className="pb-2 font-medium">Metric</th>
              <th className="pb-2 font-medium">Latest</th>
              <th className="pb-2 font-medium">MoM</th>
              <th className="pb-2 font-medium">YoY</th>
              <th className="pb-2 font-medium">Decision takeaway</th>
            </tr>
          </thead>
          <tbody>
            {group.items.map((item) => (
              <tr key={item.metric} className="border-b border-white/[0.06] align-top last:border-b-0">
                <td className="py-3.5 pr-4 text-sm font-medium text-ink">{item.metric}</td>
                <td className="py-3.5 pr-4 text-sm text-ink/90">{item.latest}</td>
                <td className="py-3.5 pr-4 text-sm text-ink/90">{item.mom}</td>
                <td className="py-3.5 pr-4 text-sm text-ink/90">{item.yoy}</td>
                <td className="py-3.5 text-sm text-muted">
                  <p className="mb-1.5">{item.takeaway}</p>
                  {item.tone && <StatusChip tone={item.tone} text={item.tone} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
