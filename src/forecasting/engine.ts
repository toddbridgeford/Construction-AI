import type { SeriesPoint } from '@/data/types'

import { mae, rmse } from './metrics'
import { FORECAST_MODELS } from './models'
import type { ForecastOutput, ForecastPoint, ModelResult } from './types'

const floorAtZero = (value: number) => Number(Math.max(0, value).toFixed(2))

const shiftMonths = (isoDate: string, months: number) => {
  const date = new Date(`${isoDate}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) {
    const fallback = new Date('2025-01-01T00:00:00.000Z')
    fallback.setMonth(fallback.getMonth() + months)
    return fallback.toISOString().slice(0, 10)
  }
  date.setMonth(date.getMonth() + months)
  return date.toISOString().slice(0, 10)
}

const validationSize = (length: number) => {
  if (length < 4) return 0
  const preferred = length >= 24 ? 12 : Math.max(2, Math.floor(length / 3))
  return Math.min(12, preferred, length - 2)
}

const computeVolatility = (history: number[], residuals: number[]) => {
  if (residuals.length > 1) {
    const residualMean = residuals.reduce((sum, value) => sum + value, 0) / residuals.length
    const variance = residuals.reduce((sum, value) => sum + (value - residualMean) ** 2, 0) / residuals.length
    return Math.sqrt(variance)
  }

  const deltas = history.slice(-12).map((value, index, points) => (index === 0 ? 0 : value - points[index - 1])).slice(1)
  if (!deltas.length) return Math.max((history.at(-1) ?? 1) * 0.05, 1)
  const mean = deltas.reduce((sum, value) => sum + value, 0) / deltas.length
  const variance = deltas.reduce((sum, value) => sum + (value - mean) ** 2, 0) / deltas.length
  return Math.max(Math.sqrt(variance), 1)
}

const toForecastPoints = (startDate: string, values: number[], volatility: number): ForecastPoint[] => {
  return values.map((rawValue, index) => {
    const value = floorAtZero(rawValue)
    const scale = Math.sqrt(index + 1)
    const margin = volatility * 1.28 * scale

    return {
      date: shiftMonths(startDate, index + 1),
      value,
      lowerBound: floorAtZero(value - margin),
      upperBound: floorAtZero(value + margin)
    }
  })
}

const emptyOutput = (horizon: 3 | 6 | 12, warning: string): ForecastOutput => ({
  horizon,
  bestModel: 'naive',
  forecast: [],
  comparison: [],
  validationWindow: 0,
  warnings: [warning]
})

export const generateForecast = (series: SeriesPoint[], horizon: 3 | 6 | 12): ForecastOutput => {
  if (!series.length) return emptyOutput(horizon, 'No historical data available for forecasting.')

  const values = series.map((point) => floorAtZero(point.value)).filter((value) => Number.isFinite(value))
  const date = series.at(-1)?.date ?? '2025-01-01'

  if (values.length < 3) {
    const fallbackValues = Array.from({ length: horizon }, () => values.at(-1) ?? 0)
    const fallbackForecast = toForecastPoints(date, fallbackValues, Math.max((values.at(-1) ?? 1) * 0.1, 1))
    return {
      horizon,
      bestModel: 'naive',
      forecast: fallbackForecast,
      comparison: [
        {
          model: 'naive',
          rmse: 0,
          mae: 0,
          forecast: fallbackForecast,
          fallbackUsed: true
        }
      ],
      validationWindow: 0,
      warnings: ['Forecast generated with minimal history; model comparison is limited.']
    }
  }

  const holdout = validationSize(values.length)
  const trainingValues = holdout > 0 ? values.slice(0, -holdout) : values
  const actualValidation = holdout > 0 ? values.slice(-holdout) : []

  const modelResults: ModelResult[] = FORECAST_MODELS.map((model) => {
    const validationRun = model.run(trainingValues, holdout || 1)
    const validationPredictions = holdout > 0 ? validationRun.values.slice(0, holdout).map(floorAtZero) : []

    const metricRmse = holdout > 0 ? rmse(actualValidation, validationPredictions) : Number.POSITIVE_INFINITY
    const metricMae = holdout > 0 ? mae(actualValidation, validationPredictions) : Number.POSITIVE_INFINITY

    const fullRun = model.run(values, horizon)
    const residuals = holdout > 0 ? actualValidation.map((value, index) => value - validationPredictions[index]) : []
    const volatility = computeVolatility(values, residuals)

    return {
      model: model.name,
      rmse: Number.isFinite(metricRmse) ? metricRmse : 9999,
      mae: Number.isFinite(metricMae) ? metricMae : 9999,
      fallbackUsed: validationRun.fallbackUsed || fullRun.fallbackUsed || values.length < model.minPoints,
      forecast: toForecastPoints(date, fullRun.values, volatility)
    }
  }).sort((left, right) => left.rmse - right.rmse)

  const best = modelResults[0]
  const warnings: string[] = []
  if (holdout < 12) warnings.push('Validation window reduced due to limited history.')
  if (best.fallbackUsed) warnings.push('Best model used fallback logic because history is sparse for that method.')

  return {
    horizon,
    bestModel: best.model,
    forecast: best.forecast,
    comparison: modelResults,
    validationWindow: holdout,
    warnings
  }
}
