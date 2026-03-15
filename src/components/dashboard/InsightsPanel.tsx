import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { InsightPanelData, InsightConfidence, InsightDirection, InsightStrength, RiskFlag } from '@/insights'

type InsightsPanelProps = {
  insights: InsightPanelData
}

const cueClass: Record<InsightDirection, string> = {
  up: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/35',
  down: 'bg-rose-500/15 text-rose-300 border-rose-400/35',
  flat: 'bg-slate-500/15 text-slate-300 border-slate-400/35'
}

const confidenceClass: Record<InsightConfidence, string> = {
  high: 'text-emerald-300',
  medium: 'text-amber-300',
  low: 'text-rose-300'
}

const strengthClass: Record<InsightStrength, string> = {
  high: 'font-semibold text-foreground',
  medium: 'font-medium text-foreground/90',
  low: 'text-muted-foreground'
}

const RiskRow = ({ risk }: { risk: RiskFlag }) => (
  <div className="rounded-md border border-border/60 bg-background/35 px-2 py-1.5">
    <div className="flex items-center gap-1.5 text-[10px]">
      <span className={`rounded border px-1.5 py-0.5 uppercase tracking-[0.12em] ${cueClass[risk.direction]}`}>{risk.label}</span>
      <span className={strengthClass[risk.strength]}>{risk.strength}</span>
      <span className={confidenceClass[risk.confidence]}>• {risk.confidence} confidence</span>
    </div>
    <p className="mt-0.5 text-[10px] text-muted-foreground">{risk.detail}</p>
  </div>
)

const Section = ({
  title,
  direction,
  confidence,
  headline,
  points,
  action
}: {
  title: string
  direction: InsightDirection
  confidence: InsightConfidence
  headline: string
  points: string[]
  action: string
}) => (
  <section className="rounded-lg border border-border/70 bg-background/35 p-2">
    <div className="mb-1 flex items-center justify-between gap-1">
      <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{title}</p>
      <div className="flex items-center gap-1 text-[9px]">
        <span className={`rounded border px-1.5 py-0.5 uppercase ${cueClass[direction]}`}>{direction}</span>
        <span className={confidenceClass[confidence]}>{confidence}</span>
      </div>
    </div>
    <p className="text-[11px] font-semibold text-foreground">{headline}</p>
    <ul className="mt-1 space-y-0.5 pl-3 text-[10px] text-muted-foreground">
      {points.slice(0, 3).map((point) => (
        <li key={point} className="list-disc">
          {point}
        </li>
      ))}
    </ul>
    <p className="mt-1.5 rounded bg-primary/10 px-2 py-1 text-[10px] text-primary/90">{action}</p>
  </section>
)

export function InsightsPanel({ insights }: InsightsPanelProps) {
  return (
    <Card className="border-border/90 bg-card/70">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-2 text-[12px]">
          <span>Executive Insights</span>
          <span className={`text-[10px] ${confidenceClass[insights.summary.confidence]}`}>{insights.summary.confidence} confidence</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-[10px]">
        {insights.status === 'insufficient_data' && (
          <div className="rounded-md border border-amber-400/30 bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-200">
            Insufficient data for insight confidence. Showing limited directional context.
          </div>
        )}

        <Section
          title="Market Signal"
          direction={insights.marketSignal.direction}
          confidence={insights.marketSignal.confidence}
          headline={insights.marketSignal.headline}
          points={insights.marketSignal.supportingPoints}
          action={insights.marketSignal.actionableInterpretation}
        />

        <Section
          title="Forecast Outlook"
          direction={insights.forecastOutlook.direction}
          confidence={insights.forecastOutlook.confidence}
          headline={insights.forecastOutlook.headline}
          points={insights.forecastOutlook.supportingPoints}
          action={insights.forecastOutlook.actionableInterpretation}
        />

        <section className="rounded-lg border border-border/70 bg-background/35 p-2">
          <p className="mb-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Risk Watch</p>
          <div className="space-y-1">{insights.riskWatch.map((risk) => <RiskRow key={risk.id} risk={risk} />)}</div>
        </section>

        <section className="rounded-lg border border-border/70 bg-background/35 p-2">
          <p className="mb-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Actionable Interpretation</p>
          <ul className="space-y-0.5 pl-3 text-[10px] text-foreground/90">
            {insights.actionableInterpretation.map((item) => (
              <li key={item} className="list-disc">
                {item}
              </li>
            ))}
          </ul>
        </section>
      </CardContent>
    </Card>
  )
}
