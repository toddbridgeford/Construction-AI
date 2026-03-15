import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function MapCard() {
  return (
    <Card className="min-h-[382px] border-border/90 bg-gradient-to-b from-card via-slate-900/95 to-slate-950/95">
      <CardHeader className="border-b border-border/75 pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-[12px]">Regional Opportunity Heatmap</CardTitle>
            <p className="mt-0.5 text-[10.5px] text-muted-foreground">Permit momentum, starts, and infrastructure activity intensity</p>
          </div>
          <div className="inline-flex items-center gap-1 rounded-md border border-border/75 bg-background/45 p-0.5 text-[9.5px]">
            <button className="rounded-sm px-2 py-0.5 text-muted-foreground transition hover:text-foreground">MSA</button>
            <button className="rounded-sm border border-primary/45 bg-primary/18 px-2 py-0.5 font-medium text-primary">State</button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="h-[306px]">
        <div className="relative h-full overflow-hidden rounded-md border border-border/75 bg-gradient-to-b from-slate-800/35 via-slate-900/85 to-slate-950">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_40%,rgba(245,158,11,0.24),transparent_28%),radial-gradient(circle_at_56%_43%,rgba(245,158,11,0.19),transparent_22%),radial-gradient(circle_at_74%_30%,rgba(34,197,94,0.18),transparent_18%),radial-gradient(circle_at_40%_72%,rgba(56,189,248,0.16),transparent_20%)]" />
          <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-slate-950/80 to-transparent" />
          <div className="absolute inset-3 rounded border border-dashed border-border/55" />
          <div className="absolute left-3 top-3 rounded-sm border border-border/70 bg-slate-950/70 px-1.5 py-0.5 text-[9.5px] text-muted-foreground">Activity Index</div>
          <p className="absolute bottom-3 right-3 rounded-sm border border-border/70 bg-slate-950/78 px-1.5 py-0.5 text-[9.5px] text-muted-foreground">Map module</p>
        </div>
      </CardContent>
    </Card>
  )
}
