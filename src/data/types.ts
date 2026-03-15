export type GeographyLevel = 'us' | 'region' | 'state' | 'metro'

export type Metadata = {
  updatedAt: string
  units: Record<string, string>
  geography: {
    regions: { id: string; name: string }[]
    states: { id: string; name: string; regionId: string }[]
    metros: { id: string; name: string; stateId: string }[]
  }
  indicators: IndicatorDefinition[]
}

export type IndicatorDefinition = {
  id: string
  name: string
  group: string
  geographyLevels: GeographyLevel[]
  chartColor: string
}

export type Observation = {
  date: string
  geographyLevel: GeographyLevel
  geographyId: string
  indicatorId: string
  value: number
}

export type SeriesPoint = {
  date: string
  value: number
}

export type Series = {
  indicatorId: string
  geographyLevel: GeographyLevel
  geographyId: string
  points: SeriesPoint[]
}

export type KpiValue = {
  label: string
  value: number | null
  momChange: number | null
  yoyChange: number | null
  unit: string
}

export type MapDatum = {
  stateId: string
  stateName: string
  value: number
  indicatorId: string
}

export type ForecastRequest = {
  geographyLevel: GeographyLevel
  geographyId: string
  indicatorId: string
  periods: number
}

export type ForecastResponse = {
  request: ForecastRequest
  projectedPoints: SeriesPoint[]
}

export type DashboardData = {
  metadata: Metadata
  observations: Observation[]
  mapData: MapDatum[]
}
