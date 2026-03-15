import { adaptCensusVipPayload } from '../providers/live/adapters/censusAdapter'

export const SUPPORTED_MACRO_METRICS = ['construction_spending', 'abi', 'nahb_hmi'] as const
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
  unit: 'usd-billion' | 'index'
  source: {
    id: 'census_vip' | 'aia_abi' | 'nahb_hmi'
    label: 'Census Value of Construction Put in Place' | 'AIA Architecture Billings Index' | 'NAHB / Wells Fargo Housing Market Index'
    frequency: 'monthly'
    unit: 'usd-billion' | 'index'
    transformType: 'direct' | 'diffusion'
    transformLabel: 'direct' | 'diffusion vs 50 baseline'
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
  fetchAbiSeries?: () => Promise<unknown>
  fetchNahbHmiSeries?: () => Promise<unknown>
  now?: () => Date
  cache?: {
    hit: boolean
    stale: boolean
  }
}

const METRIC_CONFIG: Record<SupportedMacroMetric, {
  unit: 'usd-billion' | 'index'
  source: MacroSeriesApiResponse['source']
  emptyMessage: string
  successMessage: string
  errorMessage: string
  deriveRates: 'direct' | 'diffusion'
}> = {
  construction_spending: {
    unit: 'usd-billion',
    source: {
      id: 'census_vip',
      label: 'Census Value of Construction Put in Place',
      frequency: 'monthly',
      unit: 'usd-billion',
      transformType: 'direct',
      transformLabel: 'direct'
    },
    emptyMessage: 'Construction spending upstream is not configured or returned no usable points.',
    successMessage: 'Construction spending series loaded successfully.',
    errorMessage: 'Construction spending upstream request failed. No usable points were returned.',
    deriveRates: 'direct'
  },
  abi: {
    unit: 'index',
    source: {
      id: 'aia_abi',
      label: 'AIA Architecture Billings Index',
      frequency: 'monthly',
      unit: 'index',
      transformType: 'diffusion',
      transformLabel: 'diffusion vs 50 baseline'
    },
    emptyMessage: 'ABI upstream is not configured or returned no usable points.',
    successMessage: 'ABI diffusion index loaded successfully (interpret using gap vs 50 baseline).',
    errorMessage: 'ABI upstream request failed. No usable points were returned.',
    deriveRates: 'diffusion'
  },
  nahb_hmi: {
    unit: 'index',
    source: {
      id: 'nahb_hmi',
      label: 'NAHB / Wells Fargo Housing Market Index',
      frequency: 'monthly',
      unit: 'index',
      transformType: 'diffusion',
      transformLabel: 'diffusion vs 50 baseline'
    },
    emptyMessage: 'NAHB HMI upstream is not configured or returned no usable points.',
    successMessage: 'NAHB HMI diffusion index loaded successfully (interpret using gap vs 50 baseline).',
    errorMessage: 'NAHB HMI upstream request failed. No usable points were returned.',
    deriveRates: 'diffusion'
  }
}

const isSupportedMetric = (metric: string): metric is SupportedMacroMetric =>
  (SUPPORTED_MACRO_METRICS as readonly string[]).includes(metric)

const roundRate = (value: number) => Number(value.toFixed(1))

const withDerivedRates = (series: Array<{ date: string; value: number }>, mode: 'direct' | 'diffusion'): MacroSeriesPoint[] =>
  series.map((point, index, all) => {
    if (mode === 'diffusion') {
      return {
        date: point.date,
        value: point.value,
        yoy: null,
        mom: null
      }
    }

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
  unit: METRIC_CONFIG[metric].unit,
  source: METRIC_CONFIG[metric].source,
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
  const metricConfig = METRIC_CONFIG[metric]

  const fetchByMetric: Record<SupportedMacroMetric, () => Promise<unknown>> = {
    construction_spending: deps.fetchCensusVipSeries,
    abi: deps.fetchAbiSeries ?? (async () => []),
    nahb_hmi: deps.fetchNahbHmiSeries ?? (async () => [])
  }

  try {
    const upstreamPayload = await fetchByMetric[metric]()
    const normalized = adaptCensusVipPayload(upstreamPayload)

    if (normalized.length === 0) {
      return {
        status: 200,
        body: buildEmptyResponse(
          metric,
          'pending',
          metricConfig.emptyMessage,
          nowIso,
          cache
        )
      }
    }

    return {
      status: 200,
      body: {
        metric,
        unit: metricConfig.unit,
        source: metricConfig.source,
        sourceStatus: 'live',
        message: metricConfig.successMessage,
        series: withDerivedRates(normalized, metricConfig.deriveRates),
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
        metricConfig.errorMessage,
        nowIso,
        cache
      )
    }
  }
}
