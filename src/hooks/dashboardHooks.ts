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
  PipelineResponse
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
}

const pct = (value: number | null): string => (value == null ? 'N/A' : `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`)

const toGrowth = (latest: number | null, previous: number | null): number | null => {
  if (latest == null || previous == null || previous === 0) return null
  return ((latest - previous) / Math.abs(previous)) * 100
}

const computeSignal = ({ mom, baselineGap, inverse = false }: { mom: number | null; baselineGap?: number | null; inverse?: boolean }): MetricSignal => {
  const directional = baselineGap ?? mom
  if (directional == null) return 'NEUTRAL'
  const adjusted = inverse ? directional * -1 : directional
  if (adjusted > 1) return 'BULLISH'
  if (adjusted < -1) return 'BEARISH'
  return 'NEUTRAL'
}

const formatMetricValue = (value: number | null, unit: MetricUnit): string => {
  if (value == null) return 'N/A'
  if (unit === 'count') return `${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
  if (unit === 'annual-rate') return `${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}k SAAR`
  if (unit === 'usd-billion') return `$${value.toFixed(1)}B`
  if (unit === 'percent') return `${value.toFixed(2)}%`
  if (unit === 'points') return `${value.toFixed(1)} pts`
  return `${value.toFixed(1)}`
}

const fromDiffusionSeries = (series: { value: number }[]) => {
  const metrics = fromSeries(series)
  return {
    ...metrics,
    baselineGap: metrics.latest == null ? null : metrics.latest - 50
  }
}

const fromSeries = (series: { value: number }[]) => {
  const latest = series.at(-1)?.value ?? null
  const previous = series.at(-2)?.value ?? null
  const priorYear = series.length >= 13 ? series.at(-13)?.value ?? null : null
  return {
    latest,
    mom: toGrowth(latest, previous),
    yoy: toGrowth(latest, priorYear)
  }
}

const classifyReadiness = ({
  sourceStatus,
  excludedFromComposite
}: {
  sourceStatus: ActivityResponse['sourceStatus']
  excludedFromComposite: boolean
}): MetricReadinessClassification => {
  if (sourceStatus === 'pending') return 'pending'
  if (excludedFromComposite) return 'excluded-from-composite'
  return sourceStatus === 'live' ? 'live-capable' : 'fallback-capable'
}

const hasGrowthInput = ({ yoy, mom }: { yoy: number | null; mom: number | null }) => yoy != null || mom != null

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
}): CoreMetricCardContract[] => {
  const permits = fromSeries(resources.activity.data?.series ?? [])
  const starts = fromSeries(resources.activityStarts.data?.series ?? [])
  const ppi = fromSeries(resources.costs.data?.series ?? [])
  const abi = fromDiffusionSeries(resources.abi.data?.series ?? [])
  const constructionSpending = fromSeries(resources.constructionSpending.data?.series ?? [])
  const nahbHmi = fromDiffusionSeries(resources.nahbHmi.data?.series ?? [])
  const equityRows = resources.equities.data?.rows ?? []
  const equityLatest = equityRows.length ? equityRows.reduce((sum, row) => sum + row.ytd, 0) / equityRows.length : null

  const permitsGrowthValid = hasGrowthInput(permits)
  const startsGrowthValid = hasGrowthInput(starts)
  const spendingGrowthValid = hasGrowthInput(constructionSpending)
  const ppiGrowthValid = hasGrowthInput(ppi)
  const abiDiffusionValid = abi.baselineGap != null && hasGrowthInput(abi)
  const nahbDiffusionValid = nahbHmi.baselineGap != null && hasGrowthInput(nahbHmi)

  return [
    {
      id: 'building_permits',
      label: 'Building Permits',
      upstreamSource: 'FRED PERMIT (Census New Residential Construction)',
      hookPath: 'useActivity -> getActivitySeries',
      endpointPath: '/api/activity-series',
      latestValue: permits.latest,
      formattedValue: formatMetricValue(permits.latest, 'annual-rate'),
      unit: 'annual-rate',
      transformSummary: `MoM ${pct(permits.mom)} · YoY ${pct(permits.yoy)}`,
      growthMom: permits.mom,
      growthYoy: permits.yoy,
      baselineGap: null,
      transformType: 'direct',
      transformValid: permitsGrowthValid,
      transformInvalidReason: permitsGrowthValid ? undefined : 'Building permits requires YoY or MoM growth to be computed.',
      signal: computeSignal({ mom: permits.mom }),
      sourceStatus: resources.activity.data?.sourceStatus ?? 'pending',
      readinessClassification: classifyReadiness({
        sourceStatus: resources.activity.data?.sourceStatus ?? 'pending',
        excludedFromComposite: false
      }),
      freshness: resources.activity.freshness,
      safeForComposite: (resources.activity.data?.sourceStatus ?? 'pending') !== 'pending' && permitsGrowthValid,
      modelExclusionReason:
        (resources.activity.data?.sourceStatus ?? 'pending') === 'pending'
          ? 'Building permits source is pending.'
          : permitsGrowthValid
            ? undefined
            : 'Building permits missing growth input (YoY/MoM).'
    },
    {
      id: 'housing_starts',
      label: 'Housing Starts',
      upstreamSource: 'Census Housing Starts (SAAR)',
      hookPath: 'useActivity(sector=starts) -> getActivitySeries',
      endpointPath: '/api/activity-series?sector=starts',
      latestValue: starts.latest,
      formattedValue: formatMetricValue(starts.latest, 'annual-rate'),
      unit: 'annual-rate',
      transformSummary: `MoM ${pct(starts.mom)} · YoY ${pct(starts.yoy)}`,
      growthMom: starts.mom,
      growthYoy: starts.yoy,
      baselineGap: null,
      transformType: 'direct',
      transformValid: startsGrowthValid,
      transformInvalidReason: startsGrowthValid ? undefined : 'Housing starts requires YoY or MoM growth to be computed.',
      signal: computeSignal({ mom: starts.mom }),
      sourceStatus: resources.activityStarts.data?.sourceStatus ?? 'pending',
      readinessClassification: classifyReadiness({
        sourceStatus: resources.activityStarts.data?.sourceStatus ?? 'pending',
        excludedFromComposite: false
      }),
      freshness: resources.activityStarts.freshness,
      safeForComposite: (resources.activityStarts.data?.sourceStatus ?? 'pending') !== 'pending' && startsGrowthValid,
      modelExclusionReason:
        (resources.activityStarts.data?.sourceStatus ?? 'pending') === 'pending'
          ? 'Housing starts source is pending.'
          : startsGrowthValid
            ? undefined
            : 'Housing starts missing growth input (YoY/MoM).'
    },
    {
      id: 'abi',
      label: 'Architecture Billings Index (ABI)',
      upstreamSource: 'AIA ABI diffusion index (50 = expansion threshold)',
      hookPath: 'useMacro(metric=abi) -> getMacroSeries',
      endpointPath: '/api/macro-series?metric=abi',
      latestValue: abi.latest,
      formattedValue: formatMetricValue(abi.latest, 'index'),
      unit: 'index',
      transformSummary: `Diffusion baseline: 50.0 · Gap ${abi.baselineGap == null ? 'N/A' : abi.baselineGap.toFixed(1)} pts · MoM ${pct(abi.mom)} · YoY ${pct(abi.yoy)}`,
      growthMom: abi.mom,
      growthYoy: abi.yoy,
      baselineGap: abi.baselineGap,
      transformType: 'diffusion',
      transformValid: abiDiffusionValid,
      transformInvalidReason: abiDiffusionValid ? undefined : 'ABI diffusion transform requires baseline gap and YoY/MoM growth.',
      signal: computeSignal({ mom: abi.mom, baselineGap: abi.baselineGap }),
      sourceStatus: resources.abi.data?.sourceStatus ?? 'pending',
      readinessClassification: classifyReadiness({
        sourceStatus: resources.abi.data?.sourceStatus ?? 'pending',
        excludedFromComposite: false
      }),
      freshness: resources.abi.freshness,
      safeForComposite: (resources.abi.data?.sourceStatus ?? 'pending') !== 'pending' && abiDiffusionValid,
      modelExclusionReason:
        (resources.abi.data?.sourceStatus ?? 'pending') === 'pending'
          ? 'ABI source is still pending.'
          : abiDiffusionValid
            ? undefined
            : 'ABI excluded until diffusion baseline gap and growth are both valid.'
    },
    {
      id: 'construction_spending',
      label: 'Construction Spending',
      upstreamSource: 'Census Value of Construction Put in Place (monthly nominal)',
      hookPath: 'useMacro(metric=construction_spending) -> getMacroSeries',
      endpointPath: '/api/macro-series?metric=construction_spending',
      latestValue: constructionSpending.latest,
      formattedValue: formatMetricValue(constructionSpending.latest, 'usd-billion'),
      unit: 'usd-billion',
      transformSummary: `Nominal level in USD billions · MoM ${pct(constructionSpending.mom)} · YoY ${pct(constructionSpending.yoy)}`,
      growthMom: constructionSpending.mom,
      growthYoy: constructionSpending.yoy,
      baselineGap: null,
      transformType: 'direct',
      transformValid: spendingGrowthValid,
      transformInvalidReason: spendingGrowthValid ? undefined : 'Construction spending requires YoY or MoM growth to be computed.',
      signal: computeSignal({ mom: constructionSpending.mom }),
      sourceStatus: resources.constructionSpending.data?.sourceStatus ?? 'pending',
      readinessClassification: classifyReadiness({
        sourceStatus: resources.constructionSpending.data?.sourceStatus ?? 'pending',
        excludedFromComposite: false
      }),
      freshness: resources.constructionSpending.freshness,
      safeForComposite: (resources.constructionSpending.data?.sourceStatus ?? 'pending') !== 'pending' && spendingGrowthValid,
      modelExclusionReason:
        (resources.constructionSpending.data?.sourceStatus ?? 'pending') === 'pending'
          ? 'Construction spending source is still pending.'
          : spendingGrowthValid
            ? undefined
            : 'Construction spending missing growth input (YoY/MoM).'
    },
    {
      id: 'materials_ppi',
      label: 'Materials PPI',
      upstreamSource: 'BLS PPI (construction inputs)',
      hookPath: 'useCosts -> getCostSeries',
      endpointPath: '/api/cost-series',
      latestValue: ppi.latest,
      formattedValue: formatMetricValue(ppi.latest, 'index'),
      unit: 'index',
      transformSummary: `MoM ${pct(ppi.mom)} · YoY ${pct(ppi.yoy)} (inverse scoring: lower inflation is bullish)`,
      growthMom: ppi.mom,
      growthYoy: ppi.yoy,
      baselineGap: null,
      transformType: 'inverse',
      transformValid: ppiGrowthValid,
      transformInvalidReason: ppiGrowthValid ? undefined : 'Materials PPI inverse transform requires YoY or MoM growth.',
      signal: computeSignal({ mom: ppi.mom, inverse: true }),
      sourceStatus: resources.costs.data?.sourceStatus ?? 'pending',
      readinessClassification: classifyReadiness({
        sourceStatus: resources.costs.data?.sourceStatus ?? 'pending',
        excludedFromComposite: false
      }),
      freshness: resources.costs.freshness,
      safeForComposite: (resources.costs.data?.sourceStatus ?? 'pending') !== 'pending' && ppiGrowthValid,
      modelExclusionReason:
        (resources.costs.data?.sourceStatus ?? 'pending') === 'pending'
          ? 'Materials PPI source is pending.'
          : ppiGrowthValid
            ? undefined
            : 'Materials PPI excluded until inverse growth transform is valid.'
    },
    {
      id: 'nahb_hmi',
      label: 'NAHB HMI Confidence Index',
      upstreamSource: 'NAHB/Wells Fargo Housing Market Index (50 = positive sentiment threshold)',
      hookPath: 'useMacro(metric=nahb_hmi) -> getMacroSeries',
      endpointPath: '/api/macro-series?metric=nahb_hmi',
      latestValue: nahbHmi.latest,
      formattedValue: formatMetricValue(nahbHmi.latest, 'index'),
      unit: 'index',
      transformSummary: `Diffusion baseline: 50.0 · Gap ${nahbHmi.baselineGap == null ? 'N/A' : nahbHmi.baselineGap.toFixed(1)} pts · MoM ${pct(nahbHmi.mom)} · YoY ${pct(nahbHmi.yoy)}`,
      growthMom: nahbHmi.mom,
      growthYoy: nahbHmi.yoy,
      baselineGap: nahbHmi.baselineGap,
      transformType: 'diffusion',
      transformValid: nahbDiffusionValid,
      transformInvalidReason: nahbDiffusionValid ? undefined : 'NAHB HMI diffusion transform requires baseline gap and YoY/MoM growth.',
      signal: computeSignal({ mom: nahbHmi.mom, baselineGap: nahbHmi.baselineGap }),
      sourceStatus: resources.nahbHmi.data?.sourceStatus ?? 'pending',
      readinessClassification: classifyReadiness({
        sourceStatus: resources.nahbHmi.data?.sourceStatus ?? 'pending',
        excludedFromComposite: false
      }),
      freshness: resources.nahbHmi.freshness,
      safeForComposite: (resources.nahbHmi.data?.sourceStatus ?? 'pending') !== 'pending' && nahbDiffusionValid,
      modelExclusionReason:
        (resources.nahbHmi.data?.sourceStatus ?? 'pending') === 'pending'
          ? 'NAHB HMI source is still pending.'
          : nahbDiffusionValid
            ? undefined
            : 'NAHB HMI excluded until diffusion baseline gap and growth are both valid.'
    },
    {
      id: 'homebuilder_equity',
      label: 'Homebuilder Equity Performance',
      upstreamSource: 'Homebuilder equity basket snapshot',
      hookPath: 'useEquities -> getEquitiesSnapshot',
      endpointPath: '/api/equities-snapshot',
      latestValue: equityLatest,
      formattedValue: formatMetricValue(equityLatest, 'percent'),
      unit: 'percent',
      transformSummary: 'Average YTD return across tracked homebuilder symbols.',
      growthMom: null,
      growthYoy: null,
      baselineGap: null,
      transformType: 'direct',
      transformValid: false,
      transformInvalidReason: 'Homebuilder equity is policy-excluded from macro composite methodology.',
      signal: computeSignal({ mom: equityLatest }),
      sourceStatus: equityRows.every((row) => row.sourceStatus === 'pending') ? 'pending' : 'fallback',
      readinessClassification: classifyReadiness({
        sourceStatus: equityRows.every((row) => row.sourceStatus === 'pending') ? 'pending' : 'fallback',
        excludedFromComposite: true
      }),
      freshness: resources.equities.freshness,
      safeForComposite: false,
      modelExclusionReason: 'Daily market noise; excluded from macro composite input set.'
    }
  ]
}
