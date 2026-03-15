import { getEquities, getForecast, getIndicators, getMethodology, getOverview } from '@/api/client'
import type { ApiQuery } from '@/api/contracts'
import { useApiResource } from './useApiResource'

export const useOverview = (params: ApiQuery) => useApiResource(() => getOverview(params), [params.geographyLevel, params.geographyId])

export const useIndicators = (params: ApiQuery) => useApiResource(() => getIndicators(params), [params.geographyLevel, params.geographyId, params.indicatorId])

export const useForecast = (params: ApiQuery) => useApiResource(() => getForecast(params), [params.geographyLevel, params.geographyId, params.indicatorId, params.horizon])

export const useEquities = (params: ApiQuery) => useApiResource(() => getEquities(params), [params.geographyLevel, params.geographyId])

export const useMethodology = () => useApiResource(() => getMethodology(), [])
