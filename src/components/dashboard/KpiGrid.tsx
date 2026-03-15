import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { KpiMetric } from './types'

type KpiGridProps = {
  metrics: KpiMetric[]
}

const trendIndicator = {
  up: '↗',
  down: '↘',
  flat: '→'
}

export function KpiGrid({ metrics }: KpiGridProps) {
  return (
    <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => (
        <Card
          key={metric.label}
          className="border-border/90 bg-gradient-to-b from-card via-slate-900/95 to-slate-950/95 transition hover:border-primary/35"
        >
          <CardHeader className="pb-1.5">
            <CardTitle className="text-[9.5px] uppercase tracking-[0.16em] text-muted-foreground/95">{metric.label}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="font-mono text-[22px] font-semibold leading-none tabular-nums text-foreground">{metric.value}</div>
            <div
              className={cn(
                'mt-1.5 inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[9.5px] font-medium',
                metric.trend === 'up' && 'border-emerald-400/25 bg-emerald-500/10 text-emerald-300',
                metric.trend === 'down' && 'border-red-400/25 bg-red-500/10 text-red-300',
                metric.trend === 'flat' && 'border-slate-400/35 bg-slate-500/10 text-slate-300'
              )}
            >
              <span className="leading-none">{trendIndicator[metric.trend]}</span>
              <span className="font-mono tabular-nums tracking-tight">{metric.delta}</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </section>
  )
}
