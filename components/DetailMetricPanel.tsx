import { DetailMetric, TrendPoint } from '@/types';
import { SmallTrendChart } from '@/components/SmallTrendChart';

export function DetailMetricPanel({ metric, trend }: { metric: DetailMetric; trend?: TrendPoint[] }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-panel p-5">
      <div className="flex flex-col gap-2 border-b border-white/10 pb-3 md:flex-row md:items-center md:justify-between">
        <h3 className="text-base font-semibold">{metric.metric}</h3>
        <span className="text-xs text-muted">Reference Period: {metric.referencePeriod}</span>
      </div>
      <div className="mt-4 grid gap-3 text-sm md:grid-cols-5">
        <div><p className="text-xs text-muted">Latest</p><p>{metric.latest}</p></div>
        <div><p className="text-xs text-muted">Prior</p><p>{metric.prior}</p></div>
        <div><p className="text-xs text-muted">MoM</p><p>{metric.mom}</p></div>
        <div><p className="text-xs text-muted">YoY</p><p>{metric.yoy}</p></div>
        <div><p className="text-xs text-muted">Source Family</p><p>{metric.sourceFamily}</p></div>
      </div>
      <p className="mt-3 text-sm text-muted">Interpretation: {metric.interpretation}</p>
      {metric.note && <p className="mt-2 text-xs text-muted">Note: {metric.note}</p>}
      {trend && <div className="mt-4"><SmallTrendChart data={trend} label="Trend" /></div>}
    </section>
  );
}
