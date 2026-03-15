import type { ActivityResponse, CostsResponse, MacroSeriesResponse, TimeSeriesPoint } from '@/api/contracts'
import type { HookResourceState } from '@/hooks/types'
import type { EquitiesHookData, MetricReadinessClassification, MetricSignal, MetricTransformType, MetricUnit } from '@/hooks/dashboardHooks'

export type MetricId =
  | 'building_permits'
  | 'housing_starts'
  | 'abi'
  | 'construction_spending'
  | 'materials_ppi'
  | 'nahb_hmi'
  | 'homebuilder_equity'

export type MetricSourceStatus = 'live' | 'fallback' | 'pending'

export type MetricRegistryEntry = {
  id: MetricId
  label: string
  upstreamSource: string
  endpointPath: string
  hookPath: string
  unit: MetricUnit
  transformType: MetricTransformType
  transformLabel: string
  policy: {
    fallbackAllowed: boolean
    safeForCompositePolicy: 'data-driven' | 'always-false'
    pendingUntilTransformValid: boolean
  }
}

export type DerivedMetric = {
  id: MetricId
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
  sourceStatus: MetricSourceStatus
  readinessClassification: MetricReadinessClassification
  freshness: HookResourceState<ActivityResponse>['freshness']
  safeForComposite: boolean
  modelExclusionReason?: string
  history?: TimeSeriesPoint[]
}

export type MetricRuntimeResources = {
  activity: HookResourceState<ActivityResponse>
  activityStarts: HookResourceState<ActivityResponse>
  costs: HookResourceState<CostsResponse>
  equities: HookResourceState<EquitiesHookData>
  abi: HookResourceState<MacroSeriesResponse>
  constructionSpending: HookResourceState<MacroSeriesResponse>
  nahbHmi: HookResourceState<MacroSeriesResponse>
}

const pct = (value: number | null): string => (value == null ? 'N/A' : `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`)

const toGrowth = (latest: number | null, previous: number | null): number | null => {
  if (latest == null || previous == null || previous === 0) return null
  return ((latest - previous) / Math.abs(previous)) * 100
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

const fromDiffusionSeries = (series: { value: number }[]) => {
  const metrics = fromSeries(series)
  return {
    ...metrics,
    baselineGap: metrics.latest == null ? null : metrics.latest - 50
  }
}

const hasGrowthInput = ({ yoy, mom }: { yoy: number | null; mom: number | null }) => yoy != null || mom != null

const formatMetricValue = (value: number | null, unit: MetricUnit): string => {
  if (value == null) return 'N/A'
  if (unit === 'count') return `${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
  if (unit === 'annual-rate') return `${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}k SAAR`
  if (unit === 'usd-billion') return `$${value.toFixed(1)}B`
  if (unit === 'percent') return `${value.toFixed(2)}%`
  if (unit === 'points') return `${value.toFixed(1)} pts`
  return `${value.toFixed(1)}`
}

const computeSignal = ({
  mom,
  baselineGap,
  transformType,
  inverse = false
}: {
  mom: number | null
  baselineGap?: number | null
  transformType: MetricTransformType
  inverse?: boolean
}): MetricSignal => {
  const directional = baselineGap ?? mom
  if (directional == null) return 'NEUTRAL'
  const adjusted = inverse ? directional * -1 : directional

  if (transformType === 'diffusion') {
    if (adjusted > 0) return 'BULLISH'
    if (adjusted < 0) return 'BEARISH'
    return 'NEUTRAL'
  }

  if (adjusted > 1) return 'BULLISH'
  if (adjusted < -1) return 'BEARISH'
  return 'NEUTRAL'
}

const classifyReadiness = ({
  sourceStatus,
  excludedFromComposite
}: {
  sourceStatus: MetricSourceStatus
  excludedFromComposite: boolean
}): MetricReadinessClassification => {
  if (sourceStatus === 'pending') return 'pending'
  if (excludedFromComposite) return 'excluded-from-composite'
  return sourceStatus === 'live' ? 'live-capable' : 'fallback-capable'
}

const classifyRuntimeStatus = ({
  declaredStatus,
  payloadUsable,
  fallbackAllowed,
  pendingUntilTransformValid,
  transformValid
}: {
  declaredStatus: MetricSourceStatus
  payloadUsable: boolean
  fallbackAllowed: boolean
  pendingUntilTransformValid: boolean
  transformValid: boolean
}): MetricSourceStatus => {
  if (!payloadUsable) return 'pending'
  if (pendingUntilTransformValid && !transformValid) return 'pending'
  if (declaredStatus === 'live') return 'live'
  if (declaredStatus === 'fallback' && fallbackAllowed) return 'fallback'
  return 'pending'
}

const canBeCompositeSafe = ({
  sourceStatus,
  transformValid,
  hasCompositeEvidence,
  safePolicy
}: {
  sourceStatus: MetricSourceStatus
  transformValid: boolean
  hasCompositeEvidence: boolean
  safePolicy: MetricRegistryEntry['policy']['safeForCompositePolicy']
}) => {
  if (safePolicy === 'always-false') return false
  return sourceStatus !== 'pending' && transformValid && hasCompositeEvidence
}

export const METRIC_REGISTRY: Record<MetricId, MetricRegistryEntry> = {
  building_permits: {
    id: 'building_permits',
    label: 'Building Permits',
    upstreamSource: 'FRED PERMIT / Census NRC',
    endpointPath: '/api/activity-series',
    hookPath: 'useActivity -> getActivitySeries',
    unit: 'annual-rate',
    transformType: 'direct',
    transformLabel: 'direct',
    policy: { fallbackAllowed: true, safeForCompositePolicy: 'data-driven', pendingUntilTransformValid: false }
  },
  housing_starts: {
    id: 'housing_starts',
    label: 'Housing Starts',
    upstreamSource: 'Census Housing Starts',
    endpointPath: '/api/activity-series?sector=starts',
    hookPath: 'useActivity(sector=starts) -> getActivitySeries',
    unit: 'annual-rate',
    transformType: 'direct',
    transformLabel: 'direct',
    policy: { fallbackAllowed: true, safeForCompositePolicy: 'data-driven', pendingUntilTransformValid: false }
  },
  abi: {
    id: 'abi',
    label: 'Architecture Billings Index (ABI)',
    upstreamSource: 'AIA ABI',
    endpointPath: '/api/macro-series?metric=abi',
    hookPath: 'useMacro(metric=abi) -> getMacroSeries',
    unit: 'index',
    transformType: 'diffusion',
    transformLabel: 'diffusion vs 50 baseline',
    policy: { fallbackAllowed: false, safeForCompositePolicy: 'data-driven', pendingUntilTransformValid: true }
  },
  construction_spending: {
    id: 'construction_spending',
    label: 'Construction Spending',
    upstreamSource: 'Census Value of Construction Put in Place (VIP)',
    endpointPath: '/api/macro-series?metric=construction_spending',
    hookPath: 'useMacro(metric=construction_spending) -> getMacroSeries',
    unit: 'usd-billion',
    transformType: 'direct',
    transformLabel: 'direct',
    policy: { fallbackAllowed: false, safeForCompositePolicy: 'data-driven', pendingUntilTransformValid: true }
  },
  materials_ppi: {
    id: 'materials_ppi',
    label: 'Materials PPI',
    upstreamSource: 'BLS PPI construction inputs',
    endpointPath: '/api/cost-series',
    hookPath: 'useCosts -> getCostSeries',
    unit: 'index',
    transformType: 'inverse',
    transformLabel: 'inverse',
    policy: { fallbackAllowed: false, safeForCompositePolicy: 'always-false', pendingUntilTransformValid: false }
  },
  nahb_hmi: {
    id: 'nahb_hmi',
    label: 'NAHB HMI Confidence Index',
    upstreamSource: 'NAHB / Wells Fargo HMI',
    endpointPath: '/api/macro-series?metric=nahb_hmi',
    hookPath: 'useMacro(metric=nahb_hmi) -> getMacroSeries',
    unit: 'index',
    transformType: 'diffusion',
    transformLabel: 'diffusion vs 50 baseline',
    policy: { fallbackAllowed: false, safeForCompositePolicy: 'data-driven', pendingUntilTransformValid: true }
  },
  homebuilder_equity: {
    id: 'homebuilder_equity',
    label: 'Homebuilder Equity Performance',
    upstreamSource: 'equity basket snapshot',
    endpointPath: '/api/equities-snapshot',
    hookPath: 'useEquities -> getEquitiesSnapshot',
    unit: 'percent',
    transformType: 'direct',
    transformLabel: 'direct',
    policy: { fallbackAllowed: false, safeForCompositePolicy: 'always-false', pendingUntilTransformValid: false }
  }
}

export const METRIC_ORDER: MetricId[] = [
  'building_permits',
  'housing_starts',
  'abi',
  'construction_spending',
  'materials_ppi',
  'nahb_hmi',
  'homebuilder_equity'
]

export const deriveMetricCards = (resources: MetricRuntimeResources): DerivedMetric[] => {
  const permits = fromSeries(resources.activity.data?.series ?? [])
  const starts = fromSeries(resources.activityStarts.data?.series ?? [])
  const ppi = fromSeries(resources.costs.data?.series ?? [])
  const abi = fromDiffusionSeries(resources.abi.data?.series ?? [])
  const spending = fromSeries(resources.constructionSpending.data?.series ?? [])
  const nahb = fromDiffusionSeries(resources.nahbHmi.data?.series ?? [])
  const equityRows = resources.equities.data?.rows ?? []
  const equityLatest = equityRows.length ? equityRows.reduce((sum, row) => sum + row.ytd, 0) / equityRows.length : null

  const payload = {
    building_permits: {
      latest: permits.latest,
      mom: permits.mom,
      yoy: permits.yoy,
      baselineGap: null,
      transformValid: hasGrowthInput(permits),
      transformInvalidReason: 'Building permits requires YoY or MoM growth to be computed.',
      seriesLength: (resources.activity.data?.series ?? []).length,
      declaredStatus: resources.activity.data?.sourceStatus ?? 'pending',
      freshness: resources.activity.freshness,
      history: resources.activity.data?.series
    },
    housing_starts: {
      latest: starts.latest,
      mom: starts.mom,
      yoy: starts.yoy,
      baselineGap: null,
      transformValid: hasGrowthInput(starts),
      transformInvalidReason: 'Housing starts requires YoY or MoM growth to be computed.',
      seriesLength: (resources.activityStarts.data?.series ?? []).length,
      declaredStatus: resources.activityStarts.data?.sourceStatus ?? 'pending',
      freshness: resources.activityStarts.freshness,
      history: resources.activityStarts.data?.series
    },
    abi: {
      latest: abi.latest,
      mom: abi.mom,
      yoy: abi.yoy,
      baselineGap: abi.baselineGap,
      transformValid: abi.baselineGap != null,
      transformInvalidReason: 'ABI diffusion transform requires a valid latest index value to compute baseline gap vs 50.',
      seriesLength: (resources.abi.data?.series ?? []).length,
      declaredStatus: resources.abi.data?.sourceStatus ?? 'pending',
      freshness: resources.abi.freshness,
      history: resources.abi.data?.series
    },
    construction_spending: {
      latest: spending.latest,
      mom: spending.mom,
      yoy: spending.yoy,
      baselineGap: null,
      transformValid: hasGrowthInput(spending),
      transformInvalidReason: 'Construction spending requires YoY or MoM growth to be computed.',
      seriesLength: (resources.constructionSpending.data?.series ?? []).length,
      declaredStatus: resources.constructionSpending.data?.sourceStatus ?? 'pending',
      freshness: resources.constructionSpending.freshness,
      history: resources.constructionSpending.data?.series
    },
    materials_ppi: {
      latest: ppi.latest,
      mom: ppi.mom,
      yoy: ppi.yoy,
      baselineGap: null,
      transformValid: hasGrowthInput(ppi),
      transformInvalidReason: 'Materials PPI inverse transform requires YoY or MoM growth.',
      seriesLength: (resources.costs.data?.series ?? []).length,
      declaredStatus: 'pending' as MetricSourceStatus,
      freshness: resources.costs.freshness,
      history: resources.costs.data?.series
    },
    nahb_hmi: {
      latest: nahb.latest,
      mom: nahb.mom,
      yoy: nahb.yoy,
      baselineGap: nahb.baselineGap,
      transformValid: nahb.baselineGap != null,
      transformInvalidReason: 'NAHB HMI diffusion transform requires a valid latest index value to compute baseline gap vs 50.',
      seriesLength: (resources.nahbHmi.data?.series ?? []).length,
      declaredStatus: resources.nahbHmi.data?.sourceStatus ?? 'pending',
      freshness: resources.nahbHmi.freshness,
      history: resources.nahbHmi.data?.series
    },
    homebuilder_equity: {
      latest: equityLatest,
      mom: null,
      yoy: null,
      baselineGap: null,
      transformValid: false,
      transformInvalidReason: 'Homebuilder equity is policy-excluded from macro composite methodology.',
      seriesLength: equityRows.length,
      declaredStatus: equityRows.some((row) => row.sourceStatus !== 'pending') ? 'fallback' : 'pending',
      freshness: resources.equities.freshness,
      history: undefined
    }
  }

  return METRIC_ORDER.map((metricId) => {
    const registry = METRIC_REGISTRY[metricId]
    const metric = payload[metricId]
    const payloadUsable = metric.latest != null && metric.seriesLength > 0
    const sourceStatus = classifyRuntimeStatus({
      declaredStatus: metric.declaredStatus as MetricSourceStatus,
      payloadUsable,
      fallbackAllowed: registry.policy.fallbackAllowed,
      pendingUntilTransformValid: registry.policy.pendingUntilTransformValid,
      transformValid: metric.transformValid
    })

    const hasGrowth = hasGrowthInput({ yoy: metric.yoy, mom: metric.mom })
    const hasCompositeEvidence =
      metricId === 'nahb_hmi'
        ? metric.latest != null && metric.baselineGap != null
        : hasGrowth
    const safeForComposite = canBeCompositeSafe({
      sourceStatus,
      transformValid: metric.transformValid,
      hasCompositeEvidence,
      safePolicy: registry.policy.safeForCompositePolicy
    })

    const exclusionReason =
      metricId === 'materials_ppi'
        ? 'Excluded by policy: Materials PPI is forced pending and not composite-safe.'
        : metricId === 'homebuilder_equity'
          ? 'Excluded by policy: Homebuilder equity performance is always excluded from macro composite.'
          : sourceStatus === 'pending'
            ? `${registry.label} source semantics are pending.`
            : !metric.transformValid
              ? metric.transformInvalidReason
              : !safeForComposite
                ? `${registry.label} is not composite-safe for current payload.`
                : undefined

    return {
      id: metricId,
      label: registry.label,
      upstreamSource: registry.upstreamSource,
      hookPath: registry.hookPath,
      endpointPath: registry.endpointPath,
      latestValue: metric.latest,
      formattedValue: formatMetricValue(metric.latest, registry.unit),
      unit: registry.unit,
      transformSummary:
        metricId === 'abi'
          ? `Diffusion baseline: 50.0 · Gap ${metric.baselineGap == null ? 'N/A' : metric.baselineGap.toFixed(1)} pts · MoM ${pct(metric.mom)} · YoY ${pct(metric.yoy)}`
          : metricId === 'nahb_hmi'
            ? `Diffusion baseline: 50.0 · Gap ${metric.baselineGap == null ? 'N/A' : metric.baselineGap.toFixed(1)} pts (${metric.baselineGap == null ? 'signal unavailable' : metric.baselineGap > 0 ? 'above 50 = expansionary / bullish bias' : metric.baselineGap < 0 ? 'below 50 = contractionary / bearish bias' : 'at 50 = neutral'}) · MoM ${pct(metric.mom)} · YoY ${pct(metric.yoy)}`
          : metricId === 'construction_spending'
            ? `Nominal level in USD billions · MoM ${pct(metric.mom)} · YoY ${pct(metric.yoy)}`
            : metricId === 'materials_ppi'
              ? `MoM ${pct(metric.mom)} · YoY ${pct(metric.yoy)} (inverse scoring: lower inflation is bullish)`
              : metricId === 'homebuilder_equity'
                ? 'Average YTD return across tracked homebuilder symbols.'
                : `MoM ${pct(metric.mom)} · YoY ${pct(metric.yoy)}`,
      growthMom: metric.mom,
      growthYoy: metric.yoy,
      baselineGap: metric.baselineGap,
      transformType: registry.transformType,
      transformValid: metric.transformValid,
      transformInvalidReason: metric.transformValid ? undefined : metric.transformInvalidReason,
      signal: computeSignal({
        mom: metric.mom,
        baselineGap: metric.baselineGap,
        transformType: registry.transformType,
        inverse: registry.transformType === 'inverse'
      }),
      sourceStatus,
      readinessClassification: classifyReadiness({
        sourceStatus,
        excludedFromComposite: registry.policy.safeForCompositePolicy === 'always-false'
      }),
      freshness: metric.freshness,
      safeForComposite,
      modelExclusionReason: safeForComposite ? undefined : exclusionReason,
      history: metric.history
    }
  })
}
