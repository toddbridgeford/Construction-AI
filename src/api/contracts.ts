import type { GeographyLevel, MapDatum, Metadata } from '@/data/types'

export type DashboardTab = 'overview' | 'leading' | 'predictive' | 'equities' | 'methodology'
export type SectorId = 'permits' | 'starts' | 'cost_index' | 'employment'
export type HorizonMonths = 3 | 6 | 12
export type ApiMode = 'live' | 'degraded' | 'offline'
export type DataReadiness = 'live' | 'fallback' | 'pending'
export type ResponseSource = 'network' | 'cache' | 'fallback'
export type CyclePhase = 'expansion' | 'contraction' | 'transition'
export type EquitySignal = 'Bullish' | 'Neutral' | 'Bearish'

export type ApiQuery = {
  geographyLevel?: GeographyLevel
  geographyId?: string
  region?: string
  sector?: SectorId
  horizon?: HorizonMonths
  tab?: DashboardTab
}

export type ContractMeta = {
  generatedAt: string
  mode: ApiMode
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

export type TimeSeriesPoint = {
  date: string
  value: number
}

export type ForecastBand = {
  month: number
  p10: number
  p25: number
  p50: number
  p75: number
  p90: number
}

export type SeriesResponse = {
  meta: ContractMeta
  region: string
  sector: SectorId
  horizon: HorizonMonths
  series: TimeSeriesPoint[]
  sourceStatus: DataReadiness
}

export type MetadataResponse = {
  meta: ContractMeta
  geography: Metadata['geography']
  sectors: Array<{ id: SectorId; label: string; readiness: DataReadiness }>
  tabs: DashboardTab[]
}

export type ActivityResponse = SeriesResponse & {
  mapData: MapDatum[]
}

export type PipelineResponse = SeriesResponse
export type CostsResponse = SeriesResponse
export type LaborResponse = SeriesResponse

export type ForecastsResponse = {
  meta: ContractMeta
  region: string
  sector: SectorId
  horizon: HorizonMonths
  cyclePhase: CyclePhase
  bands: ForecastBand[]
  terminal: { bear: number; base: number; bull: number }
  sourceStatus: DataReadiness
}

export type ConsistencyCheck = {
  id: string
  ok: boolean
  message: string
}

export type ConsistencySummaryResponse = {
  meta: ContractMeta
  checks: ConsistencyCheck[]
}

export type EquityPoint = {
  symbol: string
  price: number
  day: number
  ytd: number
  marketCap: string
  signal: EquitySignal
  sourceStatus: DataReadiness
}

export type EquitiesSnapshotResponse = {
  meta: ContractMeta
  rows: EquityPoint[]
}
