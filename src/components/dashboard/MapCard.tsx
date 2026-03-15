import { useMemo, useState } from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { MapDatum } from '@/data/types'

type MapCardProps = {
  mapData: MapDatum[]
  selectedIndicator: string
  onIndicatorToggle: (value: string) => void
  onDrillState: (stateId: string) => void
}

type TilePosition = { x: number; y: number }

const tilePositions: Record<string, TilePosition> = {
  WA: { x: 1, y: 0 },
  CA: { x: 1, y: 2 },
  TX: { x: 4, y: 4 },
  IL: { x: 5, y: 2 },
  NY: { x: 7, y: 1 },
  FL: { x: 7, y: 5 }
}

export function MapCard({ mapData, selectedIndicator, onIndicatorToggle, onDrillState }: MapCardProps) {
  const [hovered, setHovered] = useState<MapDatum | null>(null)

  const valueExtent = useMemo(() => {
    const values = mapData.map((item) => item.value)
    return {
      min: Math.min(...values),
      max: Math.max(...values)
    }
  }, [mapData])

  const colorFor = (value: number) => {
    if (valueExtent.max === valueExtent.min) return 'rgba(245,158,11,0.35)'
    const t = (value - valueExtent.min) / (valueExtent.max - valueExtent.min)
    return `rgba(245,158,11,${0.2 + t * 0.65})`
  }

  return (
    <Card className="min-h-[382px] border-border/90 bg-gradient-to-b from-card via-slate-900/95 to-slate-950/95">
      <CardHeader className="border-b border-border/75 pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-[12px]">Regional Opportunity Heatmap</CardTitle>
            <p className="mt-0.5 text-[10.5px] text-muted-foreground">Hover states for values • click to drill into state view</p>
          </div>
          <div className="inline-flex items-center gap-1 rounded-md border border-border/75 bg-background/45 p-0.5 text-[9.5px]">
            {[
              { label: 'Permits', value: 'permits' },
              { label: 'Employment', value: 'employment' }
            ].map((option) => (
              <button
                key={option.value}
                className={`rounded-sm px-2 py-0.5 transition ${
                  selectedIndicator === option.value
                    ? 'border border-primary/45 bg-primary/18 font-medium text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => onIndicatorToggle(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="h-[306px]">
        <div className="relative h-full overflow-hidden rounded-md border border-border/75 bg-gradient-to-b from-slate-800/35 via-slate-900/85 to-slate-950 p-3">
          <svg viewBox="0 0 420 250" className="h-full w-full">
            {mapData.map((item) => {
              const tile = tilePositions[item.stateId]
              if (!tile) return null
              const x = tile.x * 50 + 30
              const y = tile.y * 34 + 18

              return (
                <g key={item.stateId}>
                  <rect
                    x={x}
                    y={y}
                    width={42}
                    height={28}
                    rx={6}
                    fill={colorFor(item.value)}
                    stroke="rgba(245,158,11,0.75)"
                    strokeWidth={hovered?.stateId === item.stateId ? 2 : 1}
                    className="cursor-pointer transition"
                    onMouseEnter={() => setHovered(item)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => onDrillState(item.stateId)}
                  />
                  <text x={x + 21} y={y + 18} textAnchor="middle" fontSize="10" fill="rgba(241,245,249,0.9)">
                    {item.stateId}
                  </text>
                </g>
              )
            })}
          </svg>

          {hovered && (
            <div className="absolute left-3 top-3 rounded-sm border border-border/70 bg-slate-950/90 px-2 py-1 text-[9.5px] text-foreground">
              <p className="font-medium">{hovered.stateName}</p>
              <p className="font-mono text-muted-foreground">{hovered.value.toFixed(1)} index</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
