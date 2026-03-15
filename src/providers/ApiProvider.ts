import { generateForecast } from '@/forecasting'
import type { DashboardData, ForecastRequest, ForecastResponse, MapDatum, Observation } from '@/data/types'
import type { DataProvider } from './types'
import type { LiveSourceConfig, NormalizedSourcePayload } from './live/types'
import { adaptFredPayload } from './live/adapters/fredAdapter'
import { adaptBlsPayload } from './live/adapters/blsAdapter'
import { adaptCensusPayload } from './live/adapters/censusAdapter'
import { scaffoldAdapter } from './live/adapters/scaffoldAdapter'
import type { ProviderRuntime } from './runtime'

type ApiProviderOptions = {
  baseUrl: string
  apiKey?: string
  sources: LiveSourceConfig[]
  fallbackProvider: DataProvider
  runtime: ProviderRuntime
}

const dedupeObservations = (items: Observation[]): Observation[] => {
  const map = new Map<string, Observation>()
  items.forEach((item) => {
    const key = [item.date, item.geographyLevel, item.geographyId, item.indicatorId].join('|')
    map.set(key, item)
  })
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date))
}

const dedupeMapData = (items: MapDatum[]): MapDatum[] => {
  const map = new Map<string, MapDatum>()
  items.forEach((item) => {
    map.set(`${item.stateId}|${item.indicatorId}`, item)
  })
  return [...map.values()]
}

export class ApiProvider implements DataProvider {
  private cache: DashboardData | null = null

  constructor(private readonly options: ApiProviderOptions) {}

  private async fetchSource(source: LiveSourceConfig): Promise<NormalizedSourcePayload> {
    if (source.id === 'hud') return scaffoldAdapter('HUD')
    if (source.id === 'bea') return scaffoldAdapter('BEA')

    const url = new URL(source.path, this.options.baseUrl)
    if (source.query) {
      Object.entries(source.query).forEach(([key, value]) => {
        url.searchParams.set(key, value)
      })
    }

    const headers: HeadersInit = {}
    if (this.options.apiKey) headers.Authorization = `Bearer ${this.options.apiKey}`

    const response = await fetch(url.toString(), { headers })

    if (!response.ok) throw new Error(`${source.name} request failed (${response.status})`)
    const payload = (await response.json()) as unknown

    switch (source.id) {
      case 'fred':
        return adaptFredPayload(payload, source.indicatorId)
      case 'bls':
        return adaptBlsPayload(payload, source.indicatorId)
      case 'census':
        return adaptCensusPayload(payload, source.indicatorId)
      default:
        return { source: source.name, observations: [], mapData: [] }
    }
  }

  async getDashboardData(): Promise<DashboardData> {
    const fallback = await this.options.fallbackProvider.getDashboardData()

    const settled = await Promise.allSettled(this.options.sources.map((source) => this.fetchSource(source)))
    const successful = settled.filter((item): item is PromiseFulfilledResult<NormalizedSourcePayload> => item.status === 'fulfilled').map((item) => item.value)
    const degradedSources = settled
      .map((result, index) => ({ result, source: this.options.sources[index].name }))
      .filter((item) => item.result.status === 'rejected')
      .map((item) => item.source)

    const liveObs = successful.flatMap((item) => item.observations)
    const liveMap = successful.flatMap((item) => item.mapData)

    const merged: DashboardData = {
      metadata: {
        ...fallback.metadata,
        updatedAt: new Date().toISOString().slice(0, 10)
      },
      observations: dedupeObservations([...fallback.observations, ...liveObs]),
      mapData: dedupeMapData([...fallback.mapData, ...liveMap])
    }

    const noLiveRows = liveObs.length === 0 && liveMap.length === 0

    this.options.runtime.setStatus({
      mode: noLiveRows ? 'demo' : 'live',
      label: noLiveRows ? 'Demo Mode' : 'Live Data',
      degradedSources,
      usedFallback: degradedSources.length > 0 || noLiveRows,
      message: degradedSources.length
        ? `Using fallback for: ${degradedSources.join(', ')}.`
        : noLiveRows
          ? 'Live endpoints returned no usable rows; using demo baseline.'
          : 'Live data connected with graceful fallbacks enabled.'
    })

    this.cache = merged
    return merged
  }

  async getForecast(request: ForecastRequest): Promise<ForecastResponse> {
    const base = this.cache ?? (await this.getDashboardData())
    const matching = base.observations
      .filter(
        (observation) =>
          observation.geographyLevel === request.geographyLevel &&
          observation.geographyId === request.geographyId &&
          observation.indicatorId === request.indicatorId
      )
      .sort((left, right) => left.date.localeCompare(right.date))
      .map((point) => ({ date: point.date, value: point.value }))

    return {
      request,
      output: generateForecast(matching, request.periods)
    }
  }
}
