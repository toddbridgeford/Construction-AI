import { generateForecast } from '@/forecasting'
import { LocalJsonProvider } from '@/providers/LocalJsonProvider'
import {
  adaptActivity,
  adaptConsistency,
  adaptCosts,
  adaptEquities,
  adaptForecasts,
  adaptLabor,
  adaptMacroSeries,
  adaptMetadata,
  adaptPipeline
} from '@/providers/live/adapters/contractAdapters'
import { readCache, readCacheRecord, writeCache } from './indexedDbCache'
import type {
  ActivityResponse,
  ApiEnvelope,
  ApiQuery,
  ConsistencySummaryResponse,
  CostsResponse,
  DataReadiness,
  EquitiesSnapshotResponse,
  ForecastsResponse,
  LaborResponse,
  MacroMetricId,
  MacroSeriesResponse,
  MetadataResponse,
  PipelineResponse,
  SectorId
} from './contracts'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
const localProvider = new LocalJsonProvider()

const buildMeta = (mode: 'live' | 'degraded' | 'offline') => ({ generatedAt: new Date().toISOString(), mode })

const endpointUrl = (path: string, params: ApiQuery = {}) => {
  const base = API_BASE_URL ?? ''
  const url = new URL(path, base || window.location.origin)
  Object.entries(params).forEach(([key, value]) => {
    if (value != null) url.searchParams.set(key, String(value))
  })
  return url.toString()
}

const getCacheKey = (path: string, params: ApiQuery = {}) =>
  `${path}?${new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)])).toString()}`

async function fetchWithCache<T>(
  path: string,
  params: ApiQuery,
  options: {
    bootstrap?: boolean
    adapter?: (payload: unknown) => T | null
    fallback: () => Promise<T>
  }
): Promise<ApiEnvelope<T>> {
  const key = getCacheKey(path, params)
  const nowIso = new Date().toISOString()

  const fetchNetwork = async (): Promise<ApiEnvelope<T>> => {
    const response = await fetch(endpointUrl(path, params), { cache: 'no-store' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const body = (await response.json()) as unknown
    const adapted = options.adapter ? options.adapter(body) : (body as T)
    if (!adapted) throw new Error('Response shape invalid for contract')
    await writeCache(key, adapted)
    return {
      data: adapted,
      freshness: { source: 'network', fetchedAt: nowIso, isStale: false, offlineSnapshot: false }
    }
  }

  if (API_BASE_URL) {
    const cachedRecord = await readCacheRecord<T>(key)
    if (options.bootstrap && cachedRecord) {
      void fetchNetwork().catch(() => undefined)
      return {
        data: cachedRecord.value,
        freshness: {
          source: 'cache',
          fetchedAt: new Date(cachedRecord.updatedAt).toISOString(),
          isStale: true,
          offlineSnapshot: !navigator.onLine
        }
      }
    }

    try {
      return await fetchNetwork()
    } catch {
      const cached = await readCacheRecord<T>(key)
      if (cached) {
        return {
          data: cached.value,
          freshness: {
            source: 'cache',
            fetchedAt: new Date(cached.updatedAt).toISOString(),
            isStale: true,
            offlineSnapshot: true
          }
        }
      }
    }
  }

  const fallbackPayload = await options.fallback()
  await writeCache(key, fallbackPayload)
  return {
    data: fallbackPayload,
    freshness: { source: 'fallback', fetchedAt: nowIso, isStale: false, offlineSnapshot: !navigator.onLine }
  }
}

const sectorToIndicator = (sector: SectorId | undefined): SectorId => sector ?? 'permits'
const sourceStatus = (isLive: boolean, pending = false): DataReadiness => (pending ? 'pending' : isLive ? 'live' : 'fallback')


const pickSeries = async (sector: SectorId, query: ApiQuery) => {
  const data = await localProvider.getDashboardData()
  return data.observations
    .filter((item) => item.indicatorId === sector && item.geographyLevel === (query.geographyLevel ?? 'us') && item.geographyId === (query.geographyId ?? 'us'))
    .slice(-60)
    .map((item) => ({ date: item.date, value: item.value }))
}

export const getMetadata = (params: ApiQuery = {}) =>
  fetchWithCache<MetadataResponse>('/api/metadata', params, {
    bootstrap: true,
    adapter: adaptMetadata,
    fallback: async () => {
      const data = await localProvider.getDashboardData()
      return {
        meta: buildMeta(API_BASE_URL ? 'degraded' : 'offline'),
        geography: data.metadata.geography,
        sectors: [
          { id: 'permits', label: 'Activity', readiness: sourceStatus(Boolean(API_BASE_URL)) },
          { id: 'starts', label: 'Pipeline', readiness: sourceStatus(Boolean(API_BASE_URL)) },
          { id: 'cost_index', label: 'Costs', readiness: sourceStatus(Boolean(API_BASE_URL), true) },
          { id: 'employment', label: 'Labor', readiness: sourceStatus(Boolean(API_BASE_URL)) }
        ],
        tabs: ['overview', 'leading', 'predictive', 'equities', 'methodology']
      }
    }
  })

export const getActivitySeries = (params: ApiQuery) =>
  fetchWithCache<ActivityResponse>('/api/activity-series', params, {
    bootstrap: true,
    adapter: adaptActivity,
    fallback: async () => {
      const activitySector: SectorId = params.sector === 'starts' ? 'starts' : 'permits'
      const data = await localProvider.getDashboardData()
      return {
        meta: buildMeta(API_BASE_URL ? 'degraded' : 'offline'),
        region: params.region ?? params.geographyId ?? 'us',
        sector: activitySector,
        horizon: params.horizon ?? 12,
        series: await pickSeries(activitySector, params),
        mapData: data.mapData.filter((item) => item.indicatorId === activitySector),
        sourceStatus: sourceStatus(Boolean(API_BASE_URL))
      }
    }
  })

export const getPipelineSeries = (params: ApiQuery) =>
  fetchWithCache<PipelineResponse>('/api/pipeline-series', params, {
    adapter: adaptPipeline,
    fallback: async () => ({
      meta: buildMeta(API_BASE_URL ? 'degraded' : 'offline'),
      region: params.region ?? params.geographyId ?? 'us',
      sector: sectorToIndicator(params.sector),
      horizon: params.horizon ?? 12,
      series: await pickSeries('starts', params),
      sourceStatus: sourceStatus(Boolean(API_BASE_URL))
    })
  })

export const getCostSeries = (params: ApiQuery) =>
  fetchWithCache<CostsResponse>('/api/cost-series', params, {
    adapter: adaptCosts,
    fallback: async () => ({
      meta: buildMeta(API_BASE_URL ? 'degraded' : 'offline'),
      region: params.region ?? params.geographyId ?? 'us',
      sector: sectorToIndicator(params.sector),
      horizon: params.horizon ?? 12,
      series: await pickSeries('cost_index', { ...params, geographyLevel: 'us', geographyId: 'us' }),
      sourceStatus: sourceStatus(Boolean(API_BASE_URL), true)
    })
  })

export const getLaborSeries = (params: ApiQuery) =>
  fetchWithCache<LaborResponse>('/api/labor-series', params, {
    adapter: adaptLabor,
    fallback: async () => ({
      meta: buildMeta(API_BASE_URL ? 'degraded' : 'offline'),
      region: params.region ?? params.geographyId ?? 'us',
      sector: sectorToIndicator(params.sector),
      horizon: params.horizon ?? 12,
      series: await pickSeries('employment', { ...params, geographyLevel: 'us', geographyId: 'us' }),
      sourceStatus: sourceStatus(Boolean(API_BASE_URL))
    })
  })

export const getForecasts = (params: ApiQuery) =>
  fetchWithCache<ForecastsResponse>('/api/forecasts', params, {
    adapter: adaptForecasts,
    fallback: async () => {
      const sector = sectorToIndicator(params.sector)
      const points = await pickSeries(sector, params)
      const horizon = params.horizon ?? 12
      const output = generateForecast(points, horizon)
      const bands = output.forecast.map((row, index) => {
        const spread = Math.max((row.upperBound - row.lowerBound) / 2, 0.5)
        return {
          month: index + 1,
          p10: row.value - spread,
          p25: row.value - spread * 0.5,
          p50: row.value,
          p75: row.value + spread * 0.5,
          p90: row.value + spread
        }
      })
      const lastTwo = output.forecast.slice(-2).map((item) => item.value)
      return {
        meta: buildMeta(API_BASE_URL ? 'degraded' : 'offline'),
        region: params.region ?? params.geographyId ?? 'us',
        sector,
        horizon,
        cyclePhase: lastTwo.length === 2 && lastTwo[1] >= lastTwo[0] ? 'expansion' : 'contraction',
        bands,
        terminal: {
          bear: bands.at(-1)?.p10 ?? 0,
          base: bands.at(-1)?.p50 ?? 0,
          bull: bands.at(-1)?.p90 ?? 0
        },
        sourceStatus: sourceStatus(Boolean(API_BASE_URL), true)
      }
    }
  })

export const getConsistencySummary = (params: ApiQuery = {}) =>
  fetchWithCache<ConsistencySummaryResponse>('/api/consistency-summary', params, {
    adapter: adaptConsistency,
    fallback: async () => ({
      meta: buildMeta(API_BASE_URL ? 'degraded' : 'offline'),
      checks: [
        { id: 'schema-contract', ok: true, message: 'All hooks consume typed contracts only.' },
        { id: 'forecast-horizon', ok: true, message: 'Forecasts constrained to contract horizons.' }
      ]
    })
  })

export const getEquitiesSnapshot = (params: ApiQuery) =>
  fetchWithCache<EquitiesSnapshotResponse>('/api/equities-snapshot', params, {
    adapter: adaptEquities,
    fallback: async () => ({
      meta: buildMeta(API_BASE_URL ? 'degraded' : 'offline'),
      rows: [
        { symbol: 'DHI', price: 145.1, day: 0.7, ytd: 8.2, marketCap: '48.1B', signal: 'Neutral', sourceStatus: 'pending' },
        { symbol: 'LEN', price: 159.4, day: -0.3, ytd: 6.1, marketCap: '42.5B', signal: 'Neutral', sourceStatus: 'pending' },
        { symbol: 'PHM', price: 121.7, day: 0.5, ytd: 10.8, marketCap: '25.4B', signal: 'Bullish', sourceStatus: 'pending' }
      ]
    })
  })



export const getMacroSeries = (params: ApiQuery & { metric: MacroMetricId }) =>
  fetchWithCache<MacroSeriesResponse>('/api/macro-series', params, {
    bootstrap: true,
    adapter: adaptMacroSeries,
    fallback: async () => ({
      meta: buildMeta(API_BASE_URL ? 'degraded' : 'offline'),
      region: params.region ?? params.geographyId ?? 'us',
      sector: 'permits',
      metric: params.metric,
      horizon: params.horizon ?? 12,
      series: [],
      sourceStatus: 'pending'
    })
  })

export const getCachedResource = <T>(path: string, params: ApiQuery = {}) => readCache<T>(getCacheKey(path, params))
