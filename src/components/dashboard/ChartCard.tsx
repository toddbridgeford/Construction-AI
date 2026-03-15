import { useMemo, useState } from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { SeriesPoint } from '@/data/types'

type RangeOption = 'all' | '10y' | '5y' | '3y' | '1y'

type ChartCardProps = {
  historical: SeriesPoint[]
  forecast: SeriesPoint[]
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

const legend = [
  { label: 'Historical', color: '#f59e0b' },
  { label: 'Forecast', color: '#38bdf8' }
]

export function ChartCard({ historical, forecast, range, onRangeChange, loading, empty }: ChartCardProps) {
  const [brushStart, setBrushStart] = useState(0)
  const [brushEnd, setBrushEnd] = useState(100)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  const rangeFiltered = useMemo(() => {
    const points = [...historical]
    const cap = rangePeriods[range]
    return Number.isFinite(cap) ? points.slice(-cap) : points
  }, [historical, range])

  const brushed = useMemo(() => {
    if (!rangeFiltered.length) return []
    const startIndex = Math.floor((brushStart / 100) * (rangeFiltered.length - 1))
    const endIndex = Math.max(startIndex + 2, Math.floor((brushEnd / 100) * (rangeFiltered.length - 1)))
    return rangeFiltered.slice(startIndex, endIndex)
  }, [brushEnd, brushStart, rangeFiltered])

  const joined = useMemo(() => [...brushed, ...forecast], [brushed, forecast])
  const maxY = Math.max(...joined.map((point) => point.value), 1)
  const minY = Math.min(...joined.map((point) => point.value), 0)

  const buildPath = (points: SeriesPoint[], isForecast = false) => {
    if (!points.length) return ''
    return points
      .map((point, index) => {
        const x = (index / Math.max(points.length - 1, 1)) * 100
        const y = 100 - ((point.value - minY) / Math.max(maxY - minY, 1)) * 100
        return `${index === 0 ? 'M' : 'L'} ${x} ${y}${isForecast ? '' : ''}`
      })
      .join(' ')
  }

  const hoveredPoint = hoverIndex != null ? brushed[hoverIndex] : null

  return (
    <Card className="min-h-[382px] border-border/90 bg-gradient-to-b from-card via-slate-900/95 to-slate-950/95">
      <CardHeader className="border-b border-border/75 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-[12px]">Construction Trend + Forecast</CardTitle>
            <p className="mt-0.5 text-[10.5px] text-muted-foreground">Historical series with interactive range + brush</p>
          </div>
          <div className="inline-flex rounded-sm border border-border/70 bg-background/45 p-0.5 text-[9px]">
            {(['all', '10y', '5y', '3y', '1y'] as RangeOption[]).map((option) => (
              <button
                key={option}
                className={`rounded-sm px-1.5 py-0.5 uppercase ${range === option ? 'bg-primary/20 text-primary' : 'text-muted-foreground'}`}
                onClick={() => onRangeChange(option)}
              >
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
              <path d={buildPath(brushed)} fill="none" stroke="#f59e0b" strokeWidth="1.5" />
              <path d={buildPath(forecast, true)} fill="none" stroke="#38bdf8" strokeWidth="1.2" strokeDasharray="3 2" />
              {brushed.map((point, index) => {
                const x = (index / Math.max(brushed.length - 1, 1)) * 100
                const y = 100 - ((point.value - minY) / Math.max(maxY - minY, 1)) * 100
                return (
                  <circle
                    key={point.date}
                    cx={x}
                    cy={y}
                    r={hoverIndex === index ? 1.8 : 0.8}
                    fill="#f59e0b"
                    onMouseEnter={() => setHoverIndex(index)}
                  />
                )
              })}
            </svg>
          )}

          {hoveredPoint && (
            <div className="absolute right-2.5 top-2.5 rounded-sm border border-border/70 bg-slate-950/88 px-1.5 py-0.5 text-[9px] text-foreground">
              <span className="font-mono">{hoveredPoint.date}</span> • <span className="font-mono">{hoveredPoint.value.toFixed(1)}</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-1 rounded-md border border-border/72 bg-background/40 p-1.5 text-[9.5px]">
          {legend.map((item) => (
            <div key={item.label} className="flex items-center gap-1.5 text-muted-foreground">
              <span className="inline-block size-1.5 rounded-full" style={{ background: item.color }} />
              {item.label}
            </div>
          ))}
        </div>

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
