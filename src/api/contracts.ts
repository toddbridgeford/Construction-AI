import type { GeographyLevel, Metadata, Observation, MapDatum } from '@/data/types'

export type ApiQuery = {
  geographyLevel?: GeographyLevel
  geographyId?: string
  indicatorId?: string
  horizon?: 12
}

export type DataReadiness = 'live' | 'fallback' | 'pending'

export type ContractMeta = {
  generatedAt: string
  mode: 'live' | 'degraded' | 'offline'
}

export type OverviewResponse = {
  meta: ContractMeta
  geography: Metadata['geography']
  indicators: Metadata['indicators']
  observations: Observation[]
  mapData: MapDatum[]
  readiness: Record<'permits' | 'starts' | 'employment' | 'cost_index', DataReadiness>
}

export type IndicatorItem = {
  id: string
  label: string
  role: string
  neutral: number
  higherIsBetter: boolean
  leadTime?: string
  source: string
  sourceStatus: DataReadiness
  series: Array<{ date: string; value: number }>
}

export type IndicatorsResponse = {
  meta: ContractMeta
  metrics: IndicatorItem[]
}

export type ForecastBand = {
  month: number
  p10: number
  p25: number
  p50: number
  p75: number
  p90: number
}

export type ForecastResponse = {
  meta: ContractMeta
  horizon: 12
  cyclePhase: 'expansion' | 'contraction' | 'transition'
  bands: ForecastBand[]
  terminal: {
    bear: number
    base: number
    bull: number
  }
  sourceStatus: DataReadiness
}

export type EquityPoint = {
  symbol: string
  price: number
  day: number
  ytd: number
  marketCap: string
  signal: 'Bullish' | 'Neutral' | 'Bearish'
  sourceStatus: DataReadiness
}

export type EquitiesResponse = {
  meta: ContractMeta
  rows: EquityPoint[]
}

export type MethodologyResponse = {
  meta: ContractMeta
  sections: Array<{ title: string; body: string }>
}

export type ConsistencyResponse = {
  meta: ContractMeta
  checks: Array<{ id: string; ok: boolean; message: string }>
}
