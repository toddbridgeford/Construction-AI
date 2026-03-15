import {
  getActivitySeries,
  getConsistencySummary,
  getCostSeries,
  getEquitiesSnapshot,
  getForecasts,
  getLaborSeries,
  getMetadata,
  getPipelineSeries
} from '@/api/client'
import type {
  ActivityResponse,
  ApiQuery,
  ConsistencySummaryResponse,
  CostsResponse,
  EquitiesSnapshotResponse,
  ForecastsResponse,
  LaborResponse,
  MetadataResponse,
  PipelineResponse
} from '@/api/contracts'
import { useApiResource } from './useApiResource'
import type {
  EquityRowContract,
  ForecastBandPointContract,
  HookResourceState,
  KpiCardContract,
  MetadataFilterOptionsContract,
  TimeSeriesPointContract
} from './types'

const toKpiCard = <T extends { series: TimeSeriesPointContract[]; sourceStatus: ActivityResponse['sourceStatus'] }>(
  id: string,
  label: string,
  resource: HookResourceState<T>
): KpiCardContract => ({
  id,
  label,
  latestValue: resource.data?.series.at(-1)?.value ?? null,
  sourceStatus: resource.data?.sourceStatus ?? 'pending',
  freshness: resource.freshness
})

export type MetadataHookData = MetadataResponse & {
  filterOptions: MetadataFilterOptionsContract
}

export type SeriesHookData = {
  raw: ActivityResponse | PipelineResponse | CostsResponse | LaborResponse
  points: TimeSeriesPointContract[]
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

export const buildLeadingKpis = (resources: {
  activity: HookResourceState<ActivityResponse>
  pipeline: HookResourceState<PipelineResponse>
  labor: HookResourceState<LaborResponse>
  costs: HookResourceState<CostsResponse>
}): KpiCardContract[] => [
  toKpiCard('activity', 'Activity', resources.activity),
  toKpiCard('pipeline', 'Pipeline', resources.pipeline),
  toKpiCard('labor', 'Labor', resources.labor),
  toKpiCard('costs', 'Costs', resources.costs)
]
