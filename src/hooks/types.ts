import type {
  DataReadiness,
  EquityPoint,
  ForecastBand,
  FreshnessMeta,
  MetadataResponse,
  ResponseSource,
  SectorId,
  TimeSeriesPoint
} from '@/api/contracts'

export type KpiCardContract = {
  id: string
  label: string
  latestValue: number | null
  sourceStatus: DataReadiness
  freshness: FreshnessStatus | null
}

export type TimeSeriesPointContract = TimeSeriesPoint

export type ForecastBandPointContract = ForecastBand

export type EquityRowContract = EquityPoint

export type MetadataFilterOption = {
  sectorId: SectorId
  label: string
  readiness: DataReadiness
}

export type MetadataFilterOptionsContract = {
  regions: MetadataResponse['geography']['regions']
  sectors: MetadataFilterOption[]
  tabs: MetadataResponse['tabs']
}

export type FreshnessStatus = {
  source: ResponseSource
  fetchedAt: string
  isStale: boolean
  offlineSnapshot: boolean
}

export type HookResourceState<T> = {
  data: T | null
  loading: boolean
  error: string | null
  freshness: FreshnessMeta | null
}
