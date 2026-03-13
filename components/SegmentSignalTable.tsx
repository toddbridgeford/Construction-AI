import Link from 'next/link';
import { SegmentSignal } from '@/types';
import { StatusChip } from '@/components/StatusChip';

export function SegmentSignalTable({ signals }: { signals: SegmentSignal[] }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-panel/75 p-4 md:p-5">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left">
          <thead>
            <tr className="border-b border-white/10 text-[11px] uppercase tracking-[0.12em] text-muted">
              <th className="pb-2 font-medium">Segment</th>
              <th className="pb-2 font-medium">Current Signal</th>
              <th className="pb-2 font-medium">Trend</th>
              <th className="pb-2 font-medium">Why It Matters</th>
            </tr>
          </thead>
          <tbody>
            {signals.map((row) => (
              <tr key={row.segment} className="border-b border-white/[0.06] align-top last:border-b-0">
                <td className="py-3.5 text-sm font-medium">{row.segment}</td>
                <td className="py-3.5 text-sm">
                  <p className="mb-1.5 text-ink/90">{row.signal}</p>
                  <StatusChip tone={row.tone} text={row.tone} />
                </td>
                <td className="py-3.5 text-sm text-ink/90">{row.trend}</td>
                <td className="py-3.5 text-sm text-muted">
                  {row.whyItMatters}
                  <div className="mt-2 text-xs text-accent/90">
                    <Link href="/data-detail">View detail →</Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
