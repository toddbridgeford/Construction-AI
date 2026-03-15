import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ModelResult } from '@/forecasting'

type ModelComparisonPanelProps = {
  models: ModelResult[]
  bestModel: string | null
}

const labels: Record<string, string> = {
  naive: 'Naive (last value)',
  ses: 'Simple Exponential Smoothing',
  holt: 'Holt Linear Trend',
  lagRegression: 'Lag-Feature Regression'
}

export function ModelComparisonPanel({ models, bestModel }: ModelComparisonPanelProps) {
  if (!models.length) {
    return (
      <Card className="border-border/90 bg-card/70">
        <CardContent className="py-4 text-[10.5px] text-muted-foreground">Model comparison unavailable for the current series.</CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-border/90 bg-card/70">
      <CardHeader className="pb-2">
        <CardTitle className="text-[12px]">Forecast Model Comparison</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5 text-[10px]">
        {models.map((model) => {
          const selected = model.model === bestModel
          return (
            <div
              key={model.model}
              className={`grid grid-cols-[1.45fr_0.7fr_0.7fr] items-center gap-2 rounded-md border px-2 py-1.5 ${
                selected ? 'border-primary/50 bg-primary/10' : 'border-border/70 bg-background/45'
              }`}
            >
              <div className="min-w-0">
                <p className={`truncate ${selected ? 'text-primary' : 'text-foreground'}`}>{labels[model.model] ?? model.model}</p>
                {model.fallbackUsed && <p className="text-[9px] text-amber-300/90">Fallback used</p>}
              </div>
              <div className="font-mono text-right text-muted-foreground">RMSE {model.rmse.toFixed(2)}</div>
              <div className="font-mono text-right text-muted-foreground">MAE {model.mae.toFixed(2)}</div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
