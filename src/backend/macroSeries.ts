import { adaptCensusVipPayload } from '../providers/live/adapters/censusAdapter'

export const SUPPORTED_MACRO_METRICS = ['construction_spending'] as const
export type SupportedMacroMetric = (typeof SUPPORTED_MACRO_METRICS)[number]

type SourceStatus = 'live' | 'fallback' | 'pending' | 'offline_snapshot' | 'error'

export type MacroSeriesPoint = {
  date: string
  value: number
  yoy: number | null
  mom: number | null
}

export type MacroSeriesApiResponse = {
  metric: SupportedMacroMetric
  source: {
    id: 'census_vip'
    label: 'Census Value of Construction Put in Place'
    frequency: 'monthly'
    unit: 'usd-billion'
    transformType: 'direct'
    transformLabel: 'direct'
  }
  sourceStatus: SourceStatus
  message?: string
  series: MacroSeriesPoint[]
  asOf: string
  cache: {
    hit: boolean
    stale: boolean
  }
}

export type MacroSeriesRouteResponse = {
  status: number
  body:
    | MacroSeriesApiResponse
    | {
        error: {
          code: 'UNSUPPORTED_METRIC'
          message: string
          metric: string
          supportedMetrics: SupportedMacroMetric[]
        }
      }
}

export type MacroSeriesDependencies = {
  fetchCensusVipSeries: () => Promise<unknown>
  now?: () => Date
  cache?: {
    hit: boolean
    stale: boolean
  }
}

const DEFAULT_SOURCE = {
  id: 'census_vip',
  label: 'Census Value of Construction Put in Place',
  frequency: 'monthly',
  unit: 'usd-billion',
  transformType: 'direct',
  transformLabel: 'direct'
} as const

const isSupportedMetric = (metric: string): metric is SupportedMacroMetric =>
  (SUPPORTED_MACRO_METRICS as readonly string[]).includes(metric)

const roundRate = (value: number) => Number(value.toFixed(1))

const withDerivedRates = (series: Array<{ date: string; value: number }>): MacroSeriesPoint[] =>
  series.map((point, index, all) => {
    const prevMonth = index > 0 ? all[index - 1] : null
    const prevYear = index > 11 ? all[index - 12] : null

    const mom = prevMonth && prevMonth.value !== 0 ? roundRate(((point.value - prevMonth.value) / prevMonth.value) * 100) : null
    const yoy = prevYear && prevYear.value !== 0 ? roundRate(((point.value - prevYear.value) / prevYear.value) * 100) : null

    return {
      date: point.date,
      value: point.value,
      yoy,
      mom
    }
  })

const buildEmptyResponse = (
  metric: SupportedMacroMetric,
  status: SourceStatus,
  message: string,
  nowIso: string,
  cache: { hit: boolean; stale: boolean }
): MacroSeriesApiResponse => ({
  metric,
  source: DEFAULT_SOURCE,
  sourceStatus: status,
  message,
  series: [],
  asOf: nowIso,
  cache
})

export const getMacroSeriesResponse = async (
  query: { metric?: string },
  deps: MacroSeriesDependencies
): Promise<MacroSeriesRouteResponse> => {
  const metric = query.metric
  if (!metric || !isSupportedMetric(metric)) {
    return {
      status: 400,
      body: {
        error: {
          code: 'UNSUPPORTED_METRIC',
          message: `Unsupported metric '${metric ?? ''}'. Supported metrics: ${SUPPORTED_MACRO_METRICS.join(', ')}.`,
          metric: metric ?? '',
          supportedMetrics: [...SUPPORTED_MACRO_METRICS]
        }
      }
    }
  }

  const nowIso = (deps.now ?? (() => new Date()))().toISOString()
  const cache = deps.cache ?? { hit: false, stale: false }

  try {
    const upstreamPayload = await deps.fetchCensusVipSeries()
    const normalized = adaptCensusVipPayload(upstreamPayload)

    if (normalized.length === 0) {
      return {
        status: 200,
        body: buildEmptyResponse(
          metric,
          'pending',
          'Construction spending upstream is not configured or returned no usable points.',
          nowIso,
          cache
        )
      }
    }

    return {
      status: 200,
      body: {
        metric,
        source: DEFAULT_SOURCE,
        sourceStatus: 'live',
        message: 'Construction spending series loaded successfully.',
        series: withDerivedRates(normalized),
        asOf: nowIso,
        cache
      }
    }
  } catch {
    return {
      status: 200,
      body: buildEmptyResponse(
        metric,
        'error',
        'Construction spending upstream request failed. No usable points were returned.',
        nowIso,
        cache
      )
    }
  }
}
