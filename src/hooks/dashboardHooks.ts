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
import type { ApiQuery } from '@/api/contracts'
import { useApiResource } from './useApiResource'

export const useMetadata = () => useApiResource(() => getMetadata(), [])
export const useActivity = (params: ApiQuery) => useApiResource(() => getActivitySeries(params), [params.region, params.sector, params.horizon, params.tab])
export const usePipeline = (params: ApiQuery) => useApiResource(() => getPipelineSeries(params), [params.region, params.sector, params.horizon, params.tab])
export const useCosts = (params: ApiQuery) => useApiResource(() => getCostSeries(params), [params.region, params.sector, params.horizon, params.tab])
export const useLabor = (params: ApiQuery) => useApiResource(() => getLaborSeries(params), [params.region, params.sector, params.horizon, params.tab])
export const useForecasts = (params: ApiQuery) => useApiResource(() => getForecasts(params), [params.region, params.sector, params.horizon, params.tab])
export const useConsistency = (params: ApiQuery) => useApiResource(() => getConsistencySummary(params), [params.region, params.sector, params.horizon, params.tab])
export const useEquities = (params: ApiQuery) => useApiResource(() => getEquitiesSnapshot(params), [params.region, params.sector, params.horizon, params.tab])
