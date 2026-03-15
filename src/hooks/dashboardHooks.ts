import {
  getActivitySeries,
  getConsistencySummary,
  getCostSeries,
  getEquitiesSnapshot,
  getForecasts,
  getLaborSeries,
  getMacroSeries,
  getMetadata,
  getPipelineSeries
} from '@/api/client'
import { deriveMetricCards } from '@/lib/metricRegistry'
import type {
  ActivityResponse,
  ApiQuery,
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
import { useApiResource } from './useApiResource'
import type {
  EquityRowContract,
  ForecastBandPointContract,
  HookResourceState,
  MetadataFilterOptionsContract
} from './types'

export type MetricSignal = 'BULLISH' | 'NEUTRAL' | 'BEARISH'
export type MetricUnit = 'count' | 'annual-rate' | 'index' | 'usd-billion' | 'percent' | 'points'
export type MetricReadinessClassification = 'live-capable' | 'fallback-capable' | 'pending' | 'excluded-from-composite'
export type MetricTransformType = 'direct' | 'inverse' | 'diffusion'

export type CoreMetricCardContract = {
  id: 'building_permits' | 'housing_starts' | 'abi' | 'construction_spending' | 'materials_ppi' | 'nahb_hmi' | 'homebuilder_equity'
  label: string
  upstreamSource: string
  hookPath: string
  endpointPath: string
  latestValue: number | null
  formattedValue: string
  unit: MetricUnit
  transformSummary: string
  growthMom: number | null
  growthYoy: number | null
  baselineGap: number | null
  transformType: MetricTransformType
  transformValid: boolean
  transformInvalidReason?: string
  signal: MetricSignal
  sourceStatus: ActivityResponse['sourceStatus']
  readinessClassification: MetricReadinessClassification
  freshness: HookResourceState<ActivityResponse>['freshness']
  safeForComposite: boolean
  modelExclusionReason?: string
  history?: TimeSeriesPoint[]
}

export type MetadataHookData = MetadataResponse & {
  filterOptions: MetadataFilterOptionsContract
}

export type ForecastsHookData = ForecastsResponse & {
  points: ForecastBandPointContract[]
}

export type EquitiesHookData = EquitiesSnapshotResponse & {
  rows: EquityRowContract[]
}

export const useMetadata = (): HookResourceState<MetadataHookData> =>
  useApiResource(
    async () => {
      const payload = await getMetadata()
      return {
        ...payload,
        data: {
          ...payload.data,
          filterOptions: {
            regions: payload.data.geography.regions,
            sectors: payload.data.sectors.map((sector) => ({
              sectorId: sector.id,
              label: sector.label,
              readiness: sector.readiness
            })),
            tabs: payload.data.tabs
          }
        }
      }
    },
    []
  )

export const useActivity = (params: ApiQuery): HookResourceState<ActivityResponse> =>
  useApiResource(() => getActivitySeries(params), [params.region, params.sector, params.horizon, params.tab])

export const usePipeline = (params: ApiQuery): HookResourceState<PipelineResponse> =>
  useApiResource(() => getPipelineSeries(params), [params.region, params.sector, params.horizon, params.tab])

export const useCosts = (params: ApiQuery): HookResourceState<CostsResponse> =>
  useApiResource(() => getCostSeries(params), [params.region, params.sector, params.horizon, params.tab])

export const useLabor = (params: ApiQuery): HookResourceState<LaborResponse> =>
  useApiResource(() => getLaborSeries(params), [params.region, params.sector, params.horizon, params.tab])


export const useMacro = (params: ApiQuery & { metric: 'construction_spending' | 'abi' | 'nahb_hmi' }): HookResourceState<MacroSeriesResponse> =>
  useApiResource(() => getMacroSeries(params), [params.region, params.horizon, params.tab, params.metric])

export const useForecasts = (params: ApiQuery): HookResourceState<ForecastsHookData> =>
  useApiResource(
    async () => {
      const payload = await getForecasts(params)
      return {
        ...payload,
        data: {
          ...payload.data,
          points: payload.data.bands
        }
      }
    },
    [params.region, params.sector, params.horizon, params.tab]
  )

export const useConsistency = (params: ApiQuery): HookResourceState<ConsistencySummaryResponse> =>
  useApiResource(() => getConsistencySummary(params), [params.region, params.sector, params.horizon, params.tab])

export const useEquities = (params: ApiQuery): HookResourceState<EquitiesHookData> =>
  useApiResource(
    async () => {
      const payload = await getEquitiesSnapshot(params)
      return {
        ...payload,
        data: {
          ...payload.data,
          rows: payload.data.rows
        }
      }
    },
    [params.region, params.sector, params.horizon, params.tab]
  )

export const buildCoreMetricCards = (resources: {
  activity: HookResourceState<ActivityResponse>
  activityStarts: HookResourceState<ActivityResponse>
  costs: HookResourceState<CostsResponse>
  equities: HookResourceState<EquitiesHookData>
  abi: HookResourceState<MacroSeriesResponse>
  constructionSpending: HookResourceState<MacroSeriesResponse>
  nahbHmi: HookResourceState<MacroSeriesResponse>
}): CoreMetricCardContract[] => deriveMetricCards(resources)
