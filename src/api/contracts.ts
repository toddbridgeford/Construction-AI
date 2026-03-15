import type { GeographyLevel, MapDatum, Metadata } from '@/data/types'

export type DashboardTab = 'overview' | 'leading' | 'predictive' | 'equities' | 'methodology'
export type SectorId = 'permits' | 'starts' | 'cost_index' | 'employment'

export type ApiQuery = {
  geographyLevel?: GeographyLevel
  geographyId?: string
  region?: string
  sector?: SectorId
  horizon?: 3 | 6 | 12
  tab?: DashboardTab
}

export type DataReadiness = 'live' | 'fallback' | 'pending'
export type ResponseSource = 'network' | 'cache' | 'fallback'

export type ContractMeta = {
  generatedAt: string
  mode: 'live' | 'degraded' | 'offline'
}

export type FreshnessMeta = {
  source: ResponseSource
  fetchedAt: string
  isStale: boolean
  offlineSnapshot: boolean
}

export type ApiEnvelope<T> = {
  data: T
  freshness: FreshnessMeta
}

export type SeriesPoint = { date: string; value: number }

export type MetadataResponse = {
  meta: ContractMeta
  geography: Metadata['geography']
  sectors: Array<{ id: SectorId; label: string; readiness: DataReadiness }>
  tabs: DashboardTab[]
}

export type SeriesResponse = {
  meta: ContractMeta
  region: string
  sector: SectorId
  horizon: 3 | 6 | 12
  series: SeriesPoint[]
  sourceStatus: DataReadiness
}

export type ForecastBand = {
  month: number
  p10: number
  p25: number
  p50: number
  p75: number
  p90: number
}

export type ForecastsResponse = {
  meta: ContractMeta
  region: string
  sector: SectorId
  horizon: 3 | 6 | 12
  cyclePhase: 'expansion' | 'contraction' | 'transition'
  bands: ForecastBand[]
  terminal: { bear: number; base: number; bull: number }
  sourceStatus: DataReadiness
}

export type ConsistencySummaryResponse = {
  meta: ContractMeta
  checks: Array<{ id: string; ok: boolean; message: string }>
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

export type EquitiesSnapshotResponse = {
  meta: ContractMeta
  rows: EquityPoint[]
}

export type ActivityResponse = SeriesResponse & { mapData: MapDatum[] }
export type PipelineResponse = SeriesResponse
export type CostsResponse = SeriesResponse
export type LaborResponse = SeriesResponse
