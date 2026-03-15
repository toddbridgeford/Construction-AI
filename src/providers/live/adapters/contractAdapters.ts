import type {
  ActivityResponse,
  ConsistencySummaryResponse,
  CostsResponse,
  EquitiesSnapshotResponse,
  ForecastsResponse,
  LaborResponse,
  MacroSeriesResponse,
  MetadataResponse,
  PipelineResponse,
  TimeSeriesPoint
} from '@/api/contracts'

const MACRO_METRICS = new Set(['abi', 'construction_spending', 'nahb_hmi'])

const asSeries = (input: unknown): TimeSeriesPoint[] => {
  if (!Array.isArray(input)) return []
  return input
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const row = item as { date?: unknown; value?: unknown }
      if (typeof row.date !== 'string' || typeof row.value !== 'number') return null
      return { date: row.date, value: row.value }
    })
    .filter((row): row is TimeSeriesPoint => row != null)
}

export const adaptMetadata = (input: unknown): MetadataResponse | null => {
  if (!input || typeof input !== 'object') return null
  const payload = input as Partial<MetadataResponse>
  if (!payload.meta || !payload.geography || !Array.isArray(payload.sectors) || !Array.isArray(payload.tabs)) return null
  return payload as MetadataResponse
}

export const adaptActivity = (input: unknown): ActivityResponse | null => {
  if (!input || typeof input !== 'object') return null
  const payload = input as Partial<ActivityResponse>
  if (!payload.meta || typeof payload.region !== 'string' || typeof payload.sector !== 'string') return null
  return {
    ...(payload as ActivityResponse),
    series: asSeries(payload.series),
    mapData: Array.isArray(payload.mapData) ? payload.mapData : []
  }
}

const adaptSeriesResponse = <T extends PipelineResponse | CostsResponse | LaborResponse>(input: unknown): T | null => {
  if (!input || typeof input !== 'object') return null
  const payload = input as Partial<T>
  if (!payload.meta || typeof payload.region !== 'string' || typeof payload.sector !== 'string') return null
  return {
    ...(payload as T),
    series: asSeries(payload.series)
  }
}

export const adaptPipeline = (input: unknown): PipelineResponse | null => adaptSeriesResponse<PipelineResponse>(input)
export const adaptCosts = (input: unknown): CostsResponse | null => adaptSeriesResponse<CostsResponse>(input)
export const adaptLabor = (input: unknown): LaborResponse | null => adaptSeriesResponse<LaborResponse>(input)

export const adaptForecasts = (input: unknown): ForecastsResponse | null => {
  if (!input || typeof input !== 'object') return null
  const payload = input as Partial<ForecastsResponse>
  if (!payload.meta || !Array.isArray(payload.bands) || !payload.terminal) return null
  return payload as ForecastsResponse
}

export const adaptConsistency = (input: unknown): ConsistencySummaryResponse | null => {
  if (!input || typeof input !== 'object') return null
  const payload = input as Partial<ConsistencySummaryResponse>
  if (!payload.meta || !Array.isArray(payload.checks)) return null
  return payload as ConsistencySummaryResponse
}

export const adaptEquities = (input: unknown): EquitiesSnapshotResponse | null => {
  if (!input || typeof input !== 'object') return null
  const payload = input as Partial<EquitiesSnapshotResponse>
  if (!payload.meta || !Array.isArray(payload.rows)) return null
  return payload as EquitiesSnapshotResponse
}


export const adaptMacroSeries = (input: unknown): MacroSeriesResponse | null => {
  const base = adaptSeriesResponse<MacroSeriesResponse>(input)
  const metric = (base as { metric?: unknown } | null)?.metric
  if (!base || typeof metric !== 'string' || !MACRO_METRICS.has(metric)) return null
  return base
}
