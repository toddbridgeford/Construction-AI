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

const normalizeMonthlyDate = (input: string): string | null => {
  const trimmed = input.trim()
  if (/^\d{4}-\d{2}$/.test(trimmed)) return trimmed

  const ymd = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (ymd) return `${ymd[1]}-${ymd[2]}`

  const compact = trimmed.match(/^(\d{4})(\d{2})$/)
  if (compact) return `${compact[1]}-${compact[2]}`

  return null
}

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''))
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

const asSeries = (input: unknown): TimeSeriesPoint[] => {
  if (!Array.isArray(input)) return []
  return input
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const row = item as {
        date?: unknown
        period?: unknown
        month?: unknown
        value?: unknown
        observation?: unknown
        observation_value?: unknown
      }
      const date =
        typeof row.date === 'string'
          ? row.date
          : typeof row.period === 'string'
            ? row.period
            : typeof row.month === 'string'
              ? row.month
              : null
      const value = toFiniteNumber(row.value ?? row.observation ?? row.observation_value)
      if (!date || value == null) return null
      return { date, value }
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
  if (!input || typeof input !== 'object') return null

  const payload = input as Partial<MacroSeriesResponse> & {
    points?: unknown
    data?: unknown
    status?: unknown
  }

  const metric = typeof payload.metric === 'string' ? payload.metric : null
  if (!metric || !MACRO_METRICS.has(metric)) return null

  const series = asSeries(payload.series ?? payload.points ?? payload.data)
    .map((row) => {
      const date = normalizeMonthlyDate(row.date)
      return date ? { ...row, date } : null
    })
    .filter((row): row is TimeSeriesPoint => row != null)
    .sort((a, b) => a.date.localeCompare(b.date))
  const sourceStatus =
    payload.sourceStatus === 'live' || payload.sourceStatus === 'fallback' || payload.sourceStatus === 'pending'
      ? payload.sourceStatus
      : payload.status === 'live' || payload.status === 'fallback' || payload.status === 'pending'
        ? payload.status
        : 'pending'

  return {
    meta:
      payload.meta && typeof payload.meta.generatedAt === 'string' && (payload.meta.mode === 'live' || payload.meta.mode === 'degraded' || payload.meta.mode === 'offline')
        ? payload.meta
        : { generatedAt: new Date().toISOString(), mode: 'degraded' },
    region: typeof payload.region === 'string' ? payload.region : 'us',
    sector: payload.sector === 'permits' || payload.sector === 'starts' || payload.sector === 'cost_index' || payload.sector === 'employment' ? payload.sector : 'permits',
    horizon: payload.horizon === 3 || payload.horizon === 6 || payload.horizon === 12 ? payload.horizon : 12,
    metric,
    series,
    sourceStatus
  }
}
