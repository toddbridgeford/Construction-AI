import { useMemo, useState } from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { MapDatum } from '@/data/types'
import geometry from '@/data/us-state-geometry.json'

type MapCardProps = {
  mapData: MapDatum[]
  selectedIndicator: string
  onIndicatorToggle: (value: string) => void
  onDrillState: (stateId: string) => void
}

type GeoFeature = {
  properties: { stateId: string; stateName: string }
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][] | number[][][][] }
}

const viewBox = { width: 960, height: 600 }

const project = ([lon, lat]: number[]) => {
  const x = ((lon + 130) / 65) * viewBox.width
  const y = ((52 - lat) / 28) * viewBox.height
  return [x, y]
}

const pathForPolygon = (polygon: number[][]) =>
  polygon
    .map((point, index) => {
      const [x, y] = project(point)
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ') + ' Z'

const buildPath = (feature: GeoFeature): string => {
  if (feature.geometry.type === 'Polygon') {
    return (feature.geometry.coordinates as number[][][]).map((ring) => pathForPolygon(ring)).join(' ')
  }
  return (feature.geometry.coordinates as number[][][][])
    .map((polygon) => polygon.map((ring) => pathForPolygon(ring)).join(' '))
    .join(' ')
}

export function MapCard({ mapData, selectedIndicator, onIndicatorToggle, onDrillState }: MapCardProps) {
  const [hovered, setHovered] = useState<MapDatum | null>(null)
  const byState = useMemo(() => new Map(mapData.map((item) => [item.stateId, item])), [mapData])

  const valueExtent = useMemo(() => {
    const values = mapData.map((item) => item.value)
    return { min: Math.min(...values), max: Math.max(...values) }
  }, [mapData])

  const colorFor = (stateId: string) => {
    const state = byState.get(stateId)
    if (!state) return 'rgba(71,85,105,0.45)'
    if (valueExtent.max === valueExtent.min) return 'rgba(245,158,11,0.35)'
    const t = (state.value - valueExtent.min) / (valueExtent.max - valueExtent.min)
    return `rgba(245,158,11,${0.2 + t * 0.65})`
  }

  return (
    <Card className="min-h-[382px] border-border/90 bg-gradient-to-b from-card via-slate-900/95 to-slate-950/95">
      <CardHeader className="border-b border-border/75 pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-[12px]">Regional Opportunity Choropleth</CardTitle>
            <p className="mt-0.5 text-[10.5px] text-muted-foreground">Real state geometry fill; click to drill into state</p>
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
        <div className="relative h-full overflow-hidden rounded-md border border-border/75 bg-gradient-to-b from-slate-800/35 via-slate-900/85 to-slate-950 p-2">
          <svg viewBox={`0 0 ${viewBox.width} ${viewBox.height}`} className="h-full w-full">
            {(geometry.features as GeoFeature[]).map((feature) => {
              const datum = byState.get(feature.properties.stateId)
              return (
                <path
                  key={feature.properties.stateId}
                  d={buildPath(feature)}
                  fill={colorFor(feature.properties.stateId)}
                  stroke="rgba(148,163,184,0.55)"
                  strokeWidth={hovered?.stateId === feature.properties.stateId ? 2 : 0.8}
                  className="cursor-pointer transition"
                  onMouseEnter={() => datum && setHovered(datum)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => onDrillState(feature.properties.stateId)}
                />
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
