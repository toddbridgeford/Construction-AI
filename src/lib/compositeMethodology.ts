import { generateForecast } from '@/forecasting'
import type { TimeSeriesPoint } from '@/api/contracts'
import { METRIC_ORDER, METRIC_REGISTRY } from '@/lib/metricRegistry'

export type CompositeMetricId =
  | 'building_permits'
  | 'housing_starts'
  | 'abi'
  | 'construction_spending'
  | 'materials_ppi'
  | 'nahb_hmi'
  | 'homebuilder_equity'

export type CompositeMetricInput = {
  id: CompositeMetricId
  label: string
  sourceStatus: 'live' | 'fallback' | 'pending'
  safeForComposite: boolean
  growthMom: number | null
  growthYoy: number | null
  latestValue: number | null
  baselineGap: number | null
  transformType: 'direct' | 'inverse' | 'diffusion'
  transformValid: boolean
  transformInvalidReason?: string
  modelExclusionReason?: string
  history?: TimeSeriesPoint[]
}

export type CompositeHistoryPoint = {
  date: string
  score: number
  validMetricCount: number
}

export type CompositeAuditItem = {
  id: CompositeMetricId
  label: string
  status: 'included' | 'excluded'
  reason: string
  inverse: boolean
  sourceStatus: 'live' | 'fallback' | 'pending'
}

export type CompositeMethodologyResult = {
  score: number | null
  scoreLabel: string
  status: 'ready' | 'insufficient-inputs'
  message: string
  validMetricCount: number
  minimumRequiredMetrics: number
  history: CompositeHistoryPoint[]
  historyMessage: string
  audit: CompositeAuditItem[]
  methodology: {
    clampRangePct: number
    weighting: 'equal-weighted'
    minimumRequiredMetrics: number
    minimumRequiredHistoryPoints: number
  }
  predictiveModel: ReturnType<typeof generateForecast> | null
}

const CLAMP_RANGE_PCT = 20
const MIN_REQUIRED_METRICS = 2
const MIN_REQUIRED_HISTORY_POINTS = 3

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const normalizeDirectionalPctToScore = (directionalPct: number): number => {
  const bounded = clamp(directionalPct, -CLAMP_RANGE_PCT, CLAMP_RANGE_PCT)
  return Number((((bounded + CLAMP_RANGE_PCT) / (CLAMP_RANGE_PCT * 2)) * 100).toFixed(2))
}

const scoreFromGrowth = ({ growthPct, inverse }: { growthPct: number; inverse: boolean }) => {
  const directionalPct = inverse ? growthPct * -1 : growthPct
  return normalizeDirectionalPctToScore(directionalPct)
}

const isDiffusionSemanticsValid = (metric: CompositeMetricInput) =>
  metric.transformType !== 'diffusion' || metric.baselineGap != null

const monthGrowthPct = (current: number | undefined, previous: number | undefined): number | null => {
  if (current == null || previous == null || previous === 0) return null
  return ((current - previous) / Math.abs(previous)) * 100
}

export const computeCompositeMethodology = ({ metrics, horizon }: { metrics: CompositeMetricInput[]; horizon: 3 | 6 | 12 }): CompositeMethodologyResult => {
  const byId = new Map(metrics.map((metric) => [metric.id, metric]))

  const audit = METRIC_ORDER.map((metricId): CompositeAuditItem => {
    const rule = METRIC_REGISTRY[metricId]
    const metric = byId.get(rule.id)

    if (!metric) {
      return {
        id: rule.id,
        label: rule.id,
        status: 'excluded',
        reason: 'Metric not present in current hook payload.',
        inverse: rule.transformType === 'inverse',
        sourceStatus: 'pending'
      }
    }

    if (rule.policy.safeForCompositePolicy === 'always-false') {
      return {
        id: metric.id,
        label: metric.label,
        status: 'excluded',
        reason: metric.modelExclusionReason ?? 'Explicitly excluded by metric registry policy.',
        inverse: metric.transformType === 'inverse',
        sourceStatus: metric.sourceStatus
      }
    }

    if (metric.sourceStatus === 'pending') {
      return {
        id: metric.id,
        label: metric.label,
        status: 'excluded',
        reason: metric.modelExclusionReason ?? 'Pending metrics are excluded by rule.',
        inverse: metric.transformType === 'inverse',
        sourceStatus: metric.sourceStatus
      }
    }

    if (!metric.transformValid) {
      return {
        id: metric.id,
        label: metric.label,
        status: 'excluded',
        reason: metric.transformInvalidReason ?? 'Metric transform is invalid for composite normalization.',
        inverse: metric.transformType === 'inverse',
        sourceStatus: metric.sourceStatus
      }
    }

    if (rule.transformType === 'inverse' && metric.transformType !== 'inverse') {
      return {
        id: metric.id,
        label: metric.label,
        status: 'excluded',
        reason: 'Inverse methodology mismatch: expected inverse transform metadata.',
        inverse: false,
        sourceStatus: metric.sourceStatus
      }
    }

    if (rule.transformType !== 'inverse' && metric.transformType === 'inverse') {
      return {
        id: metric.id,
        label: metric.label,
        status: 'excluded',
        reason: 'Direct methodology mismatch: inverse transform metadata provided for non-inverse metric.',
        inverse: metric.transformType === 'inverse',
        sourceStatus: metric.sourceStatus
      }
    }

    if (!isDiffusionSemanticsValid(metric)) {
      return {
        id: metric.id,
        label: metric.label,
        status: 'excluded',
        reason: 'Diffusion threshold semantics invalid: baseline gap is required.',
        inverse: metric.transformType === 'inverse',
        sourceStatus: metric.sourceStatus
      }
    }

    if (!metric.safeForComposite) {
      return {
        id: metric.id,
        label: metric.label,
        status: 'excluded',
        reason: metric.modelExclusionReason ?? 'Metric flagged as not composite-eligible.',
        inverse: metric.transformType === 'inverse',
        sourceStatus: metric.sourceStatus
      }
    }

    if (metric.latestValue == null) {
      return {
        id: metric.id,
        label: metric.label,
        status: 'excluded',
        reason: 'Latest value missing.',
        inverse: metric.transformType === 'inverse',
        sourceStatus: metric.sourceStatus
      }
    }

    const growthForScore = metric.growthYoy ?? metric.growthMom
    if (growthForScore == null) {
      return {
        id: metric.id,
        label: metric.label,
        status: 'excluded',
        reason: 'No valid YoY or MoM growth available for normalization.',
        inverse: metric.transformType === 'inverse',
        sourceStatus: metric.sourceStatus
      }
    }

    return {
      id: metric.id,
      label: metric.label,
      status: 'included',
      reason: 'Included: non-pending, composite-eligible, and has valid growth input.',
      inverse: metric.transformType === 'inverse',
      sourceStatus: metric.sourceStatus
    }
  })

  const includedNow = audit.filter((item) => item.status === 'included')
  const scoredValues = includedNow
    .map((item) => {
      const metric = byId.get(item.id)
      if (!metric) return null
      const growthForScore = metric.growthYoy ?? metric.growthMom
      if (growthForScore == null) return null
      return scoreFromGrowth({ growthPct: growthForScore, inverse: item.inverse })
    })
    .filter((value): value is number => value != null)

  const score = scoredValues.length
    ? Number((scoredValues.reduce((sum, value) => sum + value, 0) / scoredValues.length).toFixed(2))
    : null

  const eligibleWithHistory = includedNow
    .map((item) => ({
      rule: item,
      history: byId.get(item.id)?.history ?? []
    }))
    .filter((entry) => entry.history.length > 1)

  const allDates = Array.from(
    new Set(eligibleWithHistory.flatMap((entry) => entry.history.map((point) => point.date)))
  ).sort((left, right) => left.localeCompare(right))

  const history = allDates
    .map((date): CompositeHistoryPoint | null => {
      const perMetricScores = eligibleWithHistory
        .map((entry) => {
          const idx = entry.history.findIndex((point) => point.date === date)
          if (idx <= 0) return null
          const current = entry.history[idx]?.value
          const previous = entry.history[idx - 1]?.value
          const growth = monthGrowthPct(current, previous)
          if (growth == null) return null
          return scoreFromGrowth({ growthPct: growth, inverse: entry.rule.inverse })
        })
        .filter((value): value is number => value != null)

      if (perMetricScores.length < MIN_REQUIRED_METRICS) return null

      return {
        date,
        score: Number((perMetricScores.reduce((sum, value) => sum + value, 0) / perMetricScores.length).toFixed(2)),
        validMetricCount: perMetricScores.length
      }
    })
    .filter((point): point is CompositeHistoryPoint => point != null)

  const historyMessage =
    history.length >= MIN_REQUIRED_HISTORY_POINTS
      ? 'Composite history is available using the same normalization and equal-weight rules.'
      : `Composite history unavailable: need at least ${MIN_REQUIRED_HISTORY_POINTS} historical points with ${MIN_REQUIRED_METRICS}+ valid metrics each.`

  const validMetricCount = includedNow.length
  const hasEnoughInputs = score != null && validMetricCount >= MIN_REQUIRED_METRICS

  const predictiveModel =
    hasEnoughInputs && history.length >= MIN_REQUIRED_HISTORY_POINTS
      ? generateForecast(
          history.map((point) => ({ date: point.date, value: point.score })),
          horizon
        )
      : null

  return {
    score: hasEnoughInputs ? score : null,
    scoreLabel: hasEnoughInputs && score != null ? `${score.toFixed(1)} / 100` : 'N/A',
    status: hasEnoughInputs ? 'ready' : 'insufficient-inputs',
    message: hasEnoughInputs
      ? 'Composite index ready using explicit equal-weight methodology.'
      : `Composite index unavailable: need at least ${MIN_REQUIRED_METRICS} valid, non-pending, composite-eligible metrics with growth inputs.`,
    validMetricCount,
    minimumRequiredMetrics: MIN_REQUIRED_METRICS,
    history,
    historyMessage,
    audit,
    methodology: {
      clampRangePct: CLAMP_RANGE_PCT,
      weighting: 'equal-weighted',
      minimumRequiredMetrics: MIN_REQUIRED_METRICS,
      minimumRequiredHistoryPoints: MIN_REQUIRED_HISTORY_POINTS
    },
    predictiveModel
  }
}
