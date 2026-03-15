import { generateForecast } from '@/forecasting'
import type { GeographyLevel } from '@/data/types'
import { LocalJsonProvider } from '@/providers/LocalJsonProvider'
import { readCache, writeCache } from './indexedDbCache'
import type {
  ApiQuery,
  ConsistencyResponse,
  EquitiesResponse,
  ForecastResponse,
  IndicatorsResponse,
  MethodologyResponse,
  OverviewResponse
} from './contracts'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
const localProvider = new LocalJsonProvider()

const meta = (mode: 'live' | 'degraded' | 'offline') => ({ generatedAt: new Date().toISOString(), mode })

const endpointUrl = (path: string, params: ApiQuery = {}) => {
  const base = API_BASE_URL ?? ''
  const url = new URL(path, base || window.location.origin)
  Object.entries(params).forEach(([k, v]) => {
    if (v != null) url.searchParams.set(k, String(v))
  })
  return url.toString()
}

async function fetchWithCache<T>(path: string, params: ApiQuery, fallback: () => Promise<T>): Promise<T> {
  const key = `${path}?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString()}`

  if (API_BASE_URL) {
    try {
      const response = await fetch(endpointUrl(path, params), { cache: 'no-store' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const payload = (await response.json()) as T
      await writeCache(key, payload)
      return payload
    } catch {
      const cached = await readCache<T>(key)
      if (cached) return cached
    }
  }

  const fallbackPayload = await fallback()
  await writeCache(key, fallbackPayload)
  return fallbackPayload
}

export async function getOverview(params: ApiQuery): Promise<OverviewResponse> {
  return fetchWithCache('/api/overview', params, async () => {
    const data = await localProvider.getDashboardData()
    return {
      meta: meta(API_BASE_URL ? 'degraded' : 'offline'),
      geography: data.metadata.geography,
      indicators: data.metadata.indicators,
      observations: data.observations,
      mapData: data.mapData,
      readiness: { permits: 'live', starts: 'live', employment: 'live', cost_index: 'fallback' }
    }
  })
}

export async function getIndicators(params: ApiQuery): Promise<IndicatorsResponse> {
  return fetchWithCache('/api/indicators', params, async () => {
    const data = await localProvider.getDashboardData()
    const pickSeries = (indicatorId: string, geographyLevel: GeographyLevel, geographyId: string) =>
      data.observations
        .filter((d) => d.indicatorId === indicatorId && d.geographyLevel === geographyLevel && d.geographyId === geographyId)
        .slice(-48)
        .map((d) => ({ date: d.date, value: d.value }))

    return {
      meta: meta(API_BASE_URL ? 'degraded' : 'offline'),
      metrics: [
        { id: 'building_permits', label: 'Building Permits', role: 'Leading', leadTime: '1–3 month lead', neutral: 100, higherIsBetter: true, source: 'FRED/Census', sourceStatus: 'live', series: pickSeries('permits', params.geographyLevel ?? 'us', params.geographyId ?? 'us') },
        { id: 'housing_starts', label: 'Housing Starts', role: 'Coincident', neutral: 100, higherIsBetter: true, source: 'Census', sourceStatus: 'live', series: pickSeries('starts', 'us', 'us') },
        { id: 'materials_ppi', label: 'Materials PPI', role: 'Inverted / Coincident', neutral: 100, higherIsBetter: false, source: 'BLS pending -> fallback index', sourceStatus: 'fallback', series: pickSeries('cost_index', 'us', 'us') }
      ]
    }
  })
}

export async function getForecast(params: ApiQuery): Promise<ForecastResponse> {
  return fetchWithCache('/api/forecast', params, async () => {
    const data = await localProvider.getDashboardData()
    const points = data.observations
      .filter((d) => d.indicatorId === (params.indicatorId ?? 'permits') && d.geographyLevel === (params.geographyLevel ?? 'us') && d.geographyId === (params.geographyId ?? 'us'))
      .slice(-60)
      .map((d) => ({ date: d.date, value: d.value }))
    const output = generateForecast(points, 12)
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
    const latest = bands.at(-1)
    const lastTwo = output.forecast.slice(-2).map((p) => p.value)
    const cyclePhase = lastTwo.length === 2 && lastTwo[1] >= lastTwo[0] ? 'expansion' : 'contraction'
    return {
      meta: meta(API_BASE_URL ? 'degraded' : 'offline'),
      horizon: 12,
      cyclePhase,
      bands,
      terminal: { bear: latest?.p10 ?? 0, base: latest?.p50 ?? 0, bull: latest?.p90 ?? 0 },
      sourceStatus: 'fallback'
    }
  })
}

export async function getEquities(params: ApiQuery): Promise<EquitiesResponse> {
  return fetchWithCache('/api/equities', params, async () => ({
    meta: meta(API_BASE_URL ? 'degraded' : 'offline'),
    rows: [
      { symbol: 'DHI', price: 145.1, day: 0.7, ytd: 8.2, marketCap: '48.1B', signal: 'Neutral', sourceStatus: 'pending' },
      { symbol: 'LEN', price: 159.4, day: -0.3, ytd: 6.1, marketCap: '42.5B', signal: 'Neutral', sourceStatus: 'pending' },
      { symbol: 'PHM', price: 121.7, day: 0.5, ytd: 10.8, marketCap: '25.4B', signal: 'Bullish', sourceStatus: 'pending' },
      { symbol: 'ITB ETF', price: 108.4, day: 0.4, ytd: 7.4, marketCap: '3.2B', signal: 'Neutral', sourceStatus: 'pending' }
    ]
  }))
}

export async function getMethodology(): Promise<MethodologyResponse> {
  return fetchWithCache('/api/methodology', {}, async () => ({
    meta: meta(API_BASE_URL ? 'degraded' : 'offline'),
    sections: [
      { title: 'Composite construction cycle model', body: 'FastAPI contract serves normalized overview + indicator bundles. Frontend consumes typed hooks and never touches vendor payload shape.' },
      { title: 'Forecast', body: '12-month probabilistic forecast with p10/p25/p50/p75/p90 bands and bear/base/bull terminal values.' },
      { title: 'Offline/degraded behavior', body: 'IndexedDB snapshot cache is read first after live failure; local synthetic fallback is final safety net.' }
    ]
  }))
}

export async function getConsistency(): Promise<ConsistencyResponse> {
  return fetchWithCache('/api/consistency', {}, async () => ({
    meta: meta(API_BASE_URL ? 'degraded' : 'offline'),
    checks: [
      { id: 'forecast-horizon', ok: true, message: 'Forecast horizon fixed at 12 months.' },
      { id: 'quantile-ordering', ok: true, message: 'p10 <= p25 <= p50 <= p75 <= p90 enforced by generator.' }
    ]
  }))
}
