import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function ChartCard() {
  return (
    <Card className="min-h-[382px] border-border/90 bg-gradient-to-b from-card via-slate-900/95 to-slate-950/95">
      <CardHeader className="border-b border-border/75 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-[12px]">Construction Starts vs Forecast</CardTitle>
            <p className="mt-0.5 text-[10.5px] text-muted-foreground">Monthly index trend with model projection envelope</p>
          </div>
          <span className="rounded-sm border border-primary/40 bg-primary/15 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-primary">Model v1</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="relative h-[214px] overflow-hidden rounded-md border border-border/75 bg-gradient-to-b from-slate-800/20 to-slate-900/72 p-2.5">
          <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(245,158,11,0.11),transparent_43%)]" />
          <div className="absolute inset-2.5 rounded border border-dashed border-border/62" />
          <div className="absolute inset-x-2.5 bottom-7 h-px bg-border/70" />
          <div className="absolute inset-x-2.5 top-1/2 h-px bg-border/42" />
          <div className="absolute right-2.5 top-2.5 rounded-sm border border-border/70 bg-slate-950/72 px-1.5 py-0.5 text-[9px] text-muted-foreground">YTD</div>
        </div>

        <div className="grid grid-cols-2 gap-1 rounded-md border border-border/72 bg-background/40 p-1.5 text-[9.5px] sm:grid-cols-4">
          {['Actual', 'Model', 'High', 'Low'].map((label, index) => (
            <div key={label} className="flex items-center gap-1.5 text-muted-foreground">
              <span
                className="inline-block size-1.5 rounded-full"
                style={{ background: ['#f59e0b', '#38bdf8', '#22c55e', '#ef4444'][index] }}
              />
              {label}
            </div>
          ))}
        </div>

        <div className="rounded-md border border-dashed border-border/70 bg-background/35 px-2 py-1.5">
          <div className="flex items-center justify-between text-[9.5px] text-muted-foreground">
            <span>Range selector placeholder</span>
            <span className="font-mono tabular-nums">2018 → 2026</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
