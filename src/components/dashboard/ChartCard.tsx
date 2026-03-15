import { useMemo, useState } from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { SeriesPoint } from '@/data/types'
import type { ModelResult } from '@/forecasting'

type RangeOption = 'all' | '10y' | '5y' | '3y' | '1y'

type ChartCardProps = {
  historical: SeriesPoint[]
  forecast: { date: string; value: number; lowerBound: number; upperBound: number }[]
  modelComparison: ModelResult[]
  bestModel: string | null
  compareMode: boolean
  validationWindow: number
  warnings: string[]
  range: RangeOption
  onRangeChange: (value: RangeOption) => void
  loading?: boolean
  empty?: boolean
}

const rangePeriods: Record<RangeOption, number> = {
  all: Number.POSITIVE_INFINITY,
  '10y': 120,
  '5y': 60,
  '3y': 36,
  '1y': 12
}

const modelColors: Record<string, string> = {
  naive: '#94a3b8',
  ses: '#60a5fa',
  holt: '#22d3ee',
  lagRegression: '#f59e0b'
}

export function ChartCard({ historical, forecast, modelComparison, bestModel, compareMode, validationWindow, warnings, range, onRangeChange, loading, empty }: ChartCardProps) {
  const [brushStart, setBrushStart] = useState(0)
  const [brushEnd, setBrushEnd] = useState(100)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  const rangeFiltered = useMemo(() => {
    const cap = rangePeriods[range]
    return Number.isFinite(cap) ? historical.slice(-cap) : [...historical]
  }, [historical, range])

  const brushed = useMemo(() => {
    if (!rangeFiltered.length) return []
    const startIndex = Math.floor((brushStart / 100) * (rangeFiltered.length - 1))
    const endIndex = Math.max(startIndex + 2, Math.floor((brushEnd / 100) * (rangeFiltered.length - 1)))
    return rangeFiltered.slice(startIndex, endIndex)
  }, [brushEnd, brushStart, rangeFiltered])

  const histCount = brushed.length
  const totalCount = histCount + forecast.length

  const toX = (index: number) => (index / Math.max(totalCount - 1, 1)) * 100

  const compareSeries = useMemo(
    () =>
      compareMode
        ? modelComparison.map((result) => ({
            model: result.model,
            values: result.forecast.map((point) => point.value)
          }))
        : [],
    [compareMode, modelComparison]
  )

  const valuePool = useMemo(() => {
    const main = [...brushed.map((point) => point.value), ...forecast.map((point) => point.value), ...forecast.map((point) => point.lowerBound), ...forecast.map((point) => point.upperBound)]
    const compare = compareSeries.flatMap((series) => series.values)
    return [...main, ...compare]
  }, [brushed, compareSeries, forecast])

  const maxY = Math.max(...valuePool, 1)
  const minY = Math.min(...valuePool, 0)
  const toY = (value: number) => 100 - ((value - minY) / Math.max(maxY - minY, 1)) * 100

  const buildHistoricalPath = () =>
    brushed.map((point, index) => `${index === 0 ? 'M' : 'L'} ${toX(index)} ${toY(point.value)}`).join(' ')

  const buildForecastPath = (values: number[]) => {
    if (!histCount || !values.length) return ''
    const start = `M ${toX(histCount - 1)} ${toY(brushed[histCount - 1].value)}`
    const segments = values.map((value, index) => `L ${toX(histCount + index)} ${toY(value)}`)
    return [start, ...segments].join(' ')
  }

  const confidenceBandPath = useMemo(() => {
    if (!histCount || !forecast.length) return ''
    const upper = forecast.map((point, index) => `${index === 0 ? 'M' : 'L'} ${toX(histCount + index)} ${toY(point.upperBound)}`)
    const lower = [...forecast]
      .reverse()
      .map((point, reverseIndex) => {
        const index = forecast.length - reverseIndex - 1
        return `L ${toX(histCount + index)} ${toY(point.lowerBound)}`
      })
    return [...upper, ...lower, 'Z'].join(' ')
  }, [forecast, histCount])

  const hoveredPoint = hoverIndex != null ? brushed[hoverIndex] : null
  const markerX = histCount > 0 ? toX(histCount - 1) : 0

  return (
    <Card className="min-h-[382px] border-border/90 bg-gradient-to-b from-card via-slate-900/95 to-slate-950/95">
      <CardHeader className="border-b border-border/75 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-[12px]">Construction Trend + Forecast</CardTitle>
            <p className="mt-0.5 text-[10.5px] text-muted-foreground">Historical series, forecast bridge, confidence bands, model overlays</p>
          </div>
          <div className="inline-flex rounded-sm border border-border/70 bg-background/45 p-0.5 text-[9px]">
            {(['all', '10y', '5y', '3y', '1y'] as RangeOption[]).map((option) => (
              <button key={option} className={`rounded-sm px-1.5 py-0.5 uppercase ${range === option ? 'bg-primary/20 text-primary' : 'text-muted-foreground'}`} onClick={() => onRangeChange(option)}>
                {option}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="relative h-[214px] overflow-hidden rounded-md border border-border/75 bg-gradient-to-b from-slate-800/20 to-slate-900/72 p-2.5">
          {loading ? (
            <div className="grid h-full place-items-center text-[10px] text-muted-foreground">Loading market series…</div>
          ) : empty || !brushed.length ? (
            <div className="grid h-full place-items-center text-[10px] text-muted-foreground">No series data for current selection.</div>
          ) : (
            <svg viewBox="0 0 100 100" className="h-full w-full" onMouseLeave={() => setHoverIndex(null)}>
              {forecast.length > 0 && <path d={confidenceBandPath} fill="rgba(56,189,248,0.14)" stroke="none" />}
              <path d={buildHistoricalPath()} fill="none" stroke="#f59e0b" strokeWidth="1.5" />
              <path d={buildForecastPath(forecast.map((point) => point.value))} fill="none" stroke="#38bdf8" strokeWidth="1.2" strokeDasharray="3 2" />
              {compareSeries.map((series) => (
                <path
                  key={series.model}
                  d={buildForecastPath(series.values)}
                  fill="none"
                  stroke={modelColors[series.model] ?? '#a1a1aa'}
                  strokeWidth={series.model === bestModel ? 1.2 : 0.8}
                  strokeDasharray={series.model === bestModel ? '2 1' : '1.5 2.5'}
                  opacity={series.model === bestModel ? 0.95 : 0.6}
                />
              ))}
              {forecast.length > 0 && <line x1={markerX} y1={0} x2={markerX} y2={100} stroke="rgba(148,163,184,0.4)" strokeDasharray="1.5 1.5" strokeWidth="0.5" />}
              {brushed.map((point, index) => (
                <circle
                  key={point.date}
                  cx={toX(index)}
                  cy={toY(point.value)}
                  r={hoverIndex === index ? 1.8 : 0.8}
                  fill="#f59e0b"
                  onMouseEnter={() => setHoverIndex(index)}
                />
              ))}
            </svg>
          )}

          {hoveredPoint && (
            <div className="absolute right-2.5 top-2.5 rounded-sm border border-border/70 bg-slate-950/88 px-1.5 py-0.5 text-[9px] text-foreground">
              <span className="font-mono">{hoveredPoint.date}</span> • <span className="font-mono">{hoveredPoint.value.toFixed(1)}</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-1 rounded-md border border-border/72 bg-background/40 p-1.5 text-[9.5px] md:grid-cols-4">
          <div className="flex items-center gap-1.5 text-muted-foreground"><span className="inline-block size-1.5 rounded-full bg-[#f59e0b]" />Historical</div>
          <div className="flex items-center gap-1.5 text-muted-foreground"><span className="inline-block size-1.5 rounded-full bg-[#38bdf8]" />Forecast</div>
          <div className="flex items-center gap-1.5 text-muted-foreground"><span className="inline-block size-1.5 rounded-full bg-[#94a3b8]" />Confidence band</div>
          <div className="text-muted-foreground">Validation: <span className="font-mono">{validationWindow || '—'} mo</span></div>
        </div>

        {warnings.length > 0 && <div className="rounded-md border border-amber-400/40 bg-amber-500/10 px-2 py-1 text-[9.5px] text-amber-200">{warnings.join(' ')}</div>}

        <div className="rounded-md border border-dashed border-border/70 bg-background/35 px-2 py-1.5">
          <div className="flex items-center justify-between text-[9.5px] text-muted-foreground">
            <span>Brush</span>
            <span className="font-mono tabular-nums">
              {brushed[0]?.date ?? '—'} → {brushed.at(-1)?.date ?? '—'}
            </span>
          </div>
          <div className="mt-1 grid gap-1">
            <input type="range" min={0} max={95} value={brushStart} onChange={(e) => setBrushStart(Math.min(Number(e.target.value), brushEnd - 5))} />
            <input type="range" min={5} max={100} value={brushEnd} onChange={(e) => setBrushEnd(Math.max(Number(e.target.value), brushStart + 5))} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
