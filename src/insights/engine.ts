import type { SeriesPoint } from '@/data/types'

import type {
  InsightConfidence,
  InsightDirection,
  InsightInput,
  InsightPanelData,
  InsightStrength,
  RiskFlag
} from './types'

const pctChange = (current: number | undefined, previous: number | undefined): number | null => {
  if (current == null || previous == null || previous === 0) return null
  return ((current - previous) / previous) * 100
}

const classifyDirection = (value: number | null, threshold = 0.25): InsightDirection => {
  if (value == null) return 'flat'
  if (value > threshold) return 'up'
  if (value < -threshold) return 'down'
  return 'flat'
}

const classifyStrength = (value: number | null, medium = 0.8, high = 2): InsightStrength => {
  if (value == null) return 'low'
  const magnitude = Math.abs(value)
  if (magnitude >= high) return 'high'
  if (magnitude >= medium) return 'medium'
  return 'low'
}

const mean = (values: number[]) => (values.length ? values.reduce((acc, value) => acc + value, 0) / values.length : 0)

const stdDev = (values: number[]) => {
  if (!values.length) return 0
  const average = mean(values)
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)))
}

const evaluateVolatility = (series: SeriesPoint[]) => {
  const returns = series.slice(-7).map((point, index, array) => {
    if (index === 0) return null
    return pctChange(point.value, array[index - 1].value)
  }).filter((value): value is number => value != null)

  const score = stdDev(returns)
  const strength: InsightStrength = score >= 4 ? 'high' : score >= 2 ? 'medium' : 'low'

  return {
    score,
    strength,
    direction: score >= 2 ? 'up' : 'flat' as InsightDirection
  }
}

const indicatorPhrase = (indicatorId: string) => {
  if (indicatorId === 'employment') return 'labor'
  if (indicatorId === 'permits' || indicatorId === 'starts') return 'activity'
  if (indicatorId === 'cost_index') return 'materials'
  return 'market'
}

const forecastDirection = (values: number[]) => {
  if (values.length < 2) return { direction: 'flat' as InsightDirection, slopePct: 0 }
  const slopePct = pctChange(values.at(-1), values[0]) ?? 0
  return { direction: classifyDirection(slopePct, 0.35), slopePct }
}

const forecastDispersion = (forecast: InsightInput['forecast']) => {
  const points = forecast?.forecast ?? []
  if (!points.length) return { widthPct: null, confidence: 'low' as InsightConfidence }
  const ratios = points
    .map((point) => (point.value !== 0 ? (point.upperBound - point.lowerBound) / Math.abs(point.value) : null))
    .filter((value): value is number => value != null)
  const widthPct = ratios.length ? mean(ratios) * 100 : null
  const confidence: InsightConfidence = widthPct == null ? 'low' : widthPct < 18 ? 'high' : widthPct < 35 ? 'medium' : 'low'
  return { widthPct, confidence }
}

export const buildInsights = (input: InsightInput): InsightPanelData => {
  const latest = input.series.at(-1)?.value
  const mom = pctChange(input.series.at(-1)?.value, input.series.at(-2)?.value)
  const yoy = pctChange(input.series.at(-1)?.value, input.series.at(-13)?.value)

  const comparisonMom = pctChange(input.comparison?.series.at(-1)?.value, input.comparison?.series.at(-2)?.value)
  const benchmarkMom = pctChange(input.nationalBenchmark?.series.at(-1)?.value, input.nationalBenchmark?.series.at(-2)?.value)

  if (latest == null || input.series.length < 6) {
    const emptyRisk: RiskFlag = {
      id: 'insufficient-data',
      label: 'Insufficient signal depth',
      direction: 'flat',
      strength: 'low',
      confidence: 'low',
      detail: 'Insufficient data for insight confidence. Add more monthly history for a reliable read.'
    }

    return {
      status: 'insufficient_data',
      summary: {
        direction: 'flat',
        strength: 'low',
        confidence: 'low',
        headline: 'Insufficient data for insight confidence',
        supportingPoints: ['At least six observations are required for trend and volatility diagnostics.'],
        riskFlags: [emptyRisk],
        actionableInterpretation: 'Use historical expansion or alternate geographies before making directional decisions.'
      },
      marketSignal: {
        direction: 'flat',
        strength: 'low',
        confidence: 'low',
        headline: 'Market signal unavailable',
        supportingPoints: ['Current selection does not contain enough recent observations.'],
        riskFlags: [emptyRisk],
        actionableInterpretation: 'Treat this as informational only until additional data is available.'
      },
      forecastOutlook: {
        direction: 'flat',
        strength: 'low',
        confidence: 'low',
        headline: 'Forecast outlook unavailable',
        supportingPoints: ['Forecast confidence cannot be estimated with sparse history.'],
        riskFlags: [emptyRisk],
        actionableInterpretation: 'Delay scenario planning until confidence intervals stabilize.'
      },
      riskWatch: [emptyRisk],
      actionableInterpretation: ['Insufficient data for insight confidence.']
    }
  }

  const trendDirection = classifyDirection(mom)
  const trendStrength = classifyStrength(mom)
  const yoyDirection = classifyDirection(yoy)

  const forecastValues = input.forecastEnabled ? (input.forecast?.forecast ?? []).map((point) => point.value) : []
  const trendForecast = forecastDirection(forecastValues)
  const dispersion = forecastDispersion(input.forecast)
  const volatility = evaluateVolatility(input.series)

  const riskFlags: RiskFlag[] = []

  if (volatility.strength !== 'low') {
    riskFlags.push({
      id: 'volatility',
      label: 'Elevated volatility',
      direction: 'up',
      strength: volatility.strength,
      confidence: 'medium',
      detail: `Recent monthly variation is ${volatility.strength}, increasing execution risk.`
    })
  }

  if (dispersion.widthPct != null && dispersion.widthPct >= 35) {
    riskFlags.push({
      id: 'dispersion',
      label: 'Wide forecast band',
      direction: 'up',
      strength: 'high',
      confidence: 'medium',
      detail: `Forecast interval width averages ${dispersion.widthPct.toFixed(1)}%, reducing near-term precision.`
    })
  }

  if (comparisonMom != null && mom != null && Math.abs(mom - comparisonMom) >= 1.5) {
    riskFlags.push({
      id: 'divergence-kpi',
      label: 'Cross-KPI divergence',
      direction: mom > comparisonMom ? 'up' : 'down',
      strength: 'medium',
      confidence: 'medium',
      detail: `${input.indicatorName} MoM (${mom.toFixed(1)}%) diverges from ${input.comparison?.label ?? 'comparison KPI'} (${comparisonMom.toFixed(1)}%).`
    })
  }

  if (benchmarkMom != null && mom != null && Math.abs(mom - benchmarkMom) >= 1.5) {
    const momDelta = mom - benchmarkMom
    riskFlags.push({
      id: 'divergence-national',
      label: 'National divergence',
      direction: mom > benchmarkMom ? 'up' : 'down',
      strength: 'medium',
      confidence: 'high',
      detail: `${input.geographyLabel} differs from national momentum by ${momDelta.toFixed(1)}pp.`
    })
  }

  const improvingButFragile = trendDirection === 'up' && trendForecast.direction === 'up' && (dispersion.confidence === 'low' || volatility.strength === 'high')
  const weakeningMomentum = trendDirection === 'down' && (trendForecast.direction === 'down' || yoyDirection === 'down')
  const stableRangeBound = trendDirection === 'flat' && trendForecast.direction === 'flat'

  const specialRelationship = (() => {
    const comparisonId = input.comparison?.indicatorId
    if (input.indicatorId === 'employment' && comparisonId === 'permits' && mom != null && comparisonMom != null && mom > 0 && comparisonMom < 0) {
      return 'Labor resilience vs permit weakness suggests backlog support, but forward demand is softening.'
    }
    if (input.indicatorId === 'cost_index' && mom != null && comparisonMom != null && comparisonMom < 0 && mom > 0) {
      return 'Materials pressure vs activity softening indicates margin compression risk if demand cools further.'
    }
    if ((input.indicatorId === 'permits' || input.indicatorId === 'starts') && comparisonId === 'cost_index' && mom != null && comparisonMom != null && mom > 0 && comparisonMom < 0) {
      return 'Easing materials pressure is improving residential activity operating leverage.'
    }
    return null
  })()

  const headline = improvingButFragile
    ? 'Improving but fragile trend'
    : weakeningMomentum
      ? 'Weakening momentum'
      : stableRangeBound
        ? 'Stable, range-bound conditions'
        : trendForecast.direction === 'up'
          ? 'Constructive trend with measured upside'
          : trendForecast.direction === 'down'
            ? 'Softening trend with downside bias'
            : 'Mixed market signal'

  const confidence: InsightConfidence = dispersion.confidence === 'low' || riskFlags.length >= 3 ? 'low' : riskFlags.length >= 1 ? 'medium' : 'high'

  const supportingPoints = [
    `${input.indicatorName} latest value: ${latest.toFixed(1)} with MoM ${mom == null ? 'N/A' : `${mom.toFixed(1)}%`} and YoY ${yoy == null ? 'N/A' : `${yoy.toFixed(1)}%`}.`,
    `Forecast direction: ${trendForecast.direction} (${trendForecast.slopePct.toFixed(1)}% over horizon) with ${dispersion.widthPct == null ? 'N/A' : `${dispersion.widthPct.toFixed(1)}%`} average confidence-band width.`
  ]

  if (input.comparison && comparisonMom != null) {
    supportingPoints.push(`${input.comparison.label} momentum is ${comparisonMom.toFixed(1)}% MoM, contextualizing relative performance.`)
  }

  if (input.nationalBenchmark && benchmarkMom != null) {
    supportingPoints.push(`National benchmark is ${benchmarkMom.toFixed(1)}% MoM, highlighting ${input.geographyLabel} ${mom != null && mom >= benchmarkMom ? 'outperformance' : 'underperformance'}.`)
  }

  if (specialRelationship) {
    supportingPoints.push(specialRelationship)
  }

  const marketAction = improvingButFragile
    ? `Momentum is improving, but keep plans staged until ${indicatorPhrase(input.indicatorId)} volatility normalizes.`
    : weakeningMomentum
      ? 'Prioritize defensive pipeline management and tighten near-term resource commitments.'
      : stableRangeBound
        ? 'Operate with base-case assumptions and monitor for breakout signals.'
        : 'Maintain balanced positioning while monitoring signal confirmation.'

  const outlookAction = trendForecast.direction === 'up'
    ? 'Use upside scenarios for capacity planning, but gate spending to confidence thresholds.'
    : trendForecast.direction === 'down'
      ? 'Stress-test downside scenarios and maintain liquidity buffers.'
      : 'Anchor forecasts to baseline demand and update with each monthly release.'

  const actionableInterpretation = [marketAction, outlookAction]
  if (specialRelationship) actionableInterpretation.push(specialRelationship)

  return {
    status: 'ready',
    summary: {
      direction: trendDirection,
      strength: trendStrength,
      confidence,
      headline,
      supportingPoints: supportingPoints.slice(0, 3),
      riskFlags,
      actionableInterpretation: actionableInterpretation[0]
    },
    marketSignal: {
      direction: trendDirection,
      strength: trendStrength,
      confidence,
      headline,
      supportingPoints,
      riskFlags,
      actionableInterpretation: marketAction
    },
    forecastOutlook: {
      direction: trendForecast.direction,
      strength: classifyStrength(trendForecast.slopePct, 1.2, 3),
      confidence: dispersion.confidence,
      headline: `Forecast points ${trendForecast.direction === 'flat' ? 'to a flat path' : `to a ${trendForecast.direction} trajectory`}`,
      supportingPoints: [
        `Projected slope is ${trendForecast.slopePct.toFixed(1)}% over the selected horizon.`,
        dispersion.widthPct == null
          ? 'No confidence band available.'
          : `Average confidence-band width is ${dispersion.widthPct.toFixed(1)}%.`
      ],
      riskFlags,
      actionableInterpretation: outlookAction
    },
    riskWatch: riskFlags.length
      ? riskFlags
      : [
          {
            id: 'risk-contained',
            label: 'Risk contained',
            direction: 'flat',
            strength: 'low',
            confidence: 'high',
            detail: 'No elevated volatility, dispersion, or divergence flags detected.'
          }
        ],
    actionableInterpretation
  }
}

export const insightClassifiers = {
  classifyDirection,
  classifyStrength,
  evaluateVolatility
}
