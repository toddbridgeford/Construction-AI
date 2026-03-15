import type { ForecastModelName } from './types'

export type ModelExecution = {
  values: number[]
  fallbackUsed: boolean
}

type ForecastModel = {
  name: ForecastModelName
  minPoints: number
  run: (history: number[], horizon: number) => ModelExecution
}

const clampNonNegative = (value: number) => Number(Math.max(0, value).toFixed(2))

const naiveModel: ForecastModel = {
  name: 'naive',
  minPoints: 1,
  run: (history, horizon) => {
    const last = history.at(-1) ?? 0
    return {
      values: Array.from({ length: horizon }, () => clampNonNegative(last)),
      fallbackUsed: history.length < 1
    }
  }
}

const sesModel: ForecastModel = {
  name: 'ses',
  minPoints: 2,
  run: (history, horizon) => {
    if (history.length < 2) return naiveModel.run(history, horizon)

    const alpha = 0.35
    let level = history[0]
    for (let index = 1; index < history.length; index += 1) {
      level = alpha * history[index] + (1 - alpha) * level
    }

    return {
      values: Array.from({ length: horizon }, () => clampNonNegative(level)),
      fallbackUsed: false
    }
  }
}

const holtModel: ForecastModel = {
  name: 'holt',
  minPoints: 3,
  run: (history, horizon) => {
    if (history.length < 3) {
      const fallback = sesModel.run(history, horizon)
      return { ...fallback, fallbackUsed: true }
    }

    const alpha = 0.5
    const beta = 0.25
    let level = history[0]
    let trend = history[1] - history[0]

    for (let index = 1; index < history.length; index += 1) {
      const value = history[index]
      const prevLevel = level
      level = alpha * value + (1 - alpha) * (level + trend)
      trend = beta * (level - prevLevel) + (1 - beta) * trend
    }

    return {
      values: Array.from({ length: horizon }, (_, step) => clampNonNegative(level + trend * (step + 1))),
      fallbackUsed: false
    }
  }
}

const solve3x3 = (matrix: number[][], vector: number[]) => {
  const m = matrix.map((row) => [...row])
  const v = [...vector]

  for (let pivot = 0; pivot < 3; pivot += 1) {
    let maxRow = pivot
    for (let row = pivot + 1; row < 3; row += 1) {
      if (Math.abs(m[row][pivot]) > Math.abs(m[maxRow][pivot])) maxRow = row
    }

    if (Math.abs(m[maxRow][pivot]) < 1e-8) return null

    ;[m[pivot], m[maxRow]] = [m[maxRow], m[pivot]]
    ;[v[pivot], v[maxRow]] = [v[maxRow], v[pivot]]

    const factor = m[pivot][pivot]
    for (let column = pivot; column < 3; column += 1) m[pivot][column] /= factor
    v[pivot] /= factor

    for (let row = 0; row < 3; row += 1) {
      if (row === pivot) continue
      const scale = m[row][pivot]
      for (let column = pivot; column < 3; column += 1) m[row][column] -= scale * m[pivot][column]
      v[row] -= scale * v[pivot]
    }
  }

  return v
}

const lagRegressionModel: ForecastModel = {
  name: 'lagRegression',
  minPoints: 8,
  run: (history, horizon) => {
    if (history.length < 8) {
      const fallback = holtModel.run(history, horizon)
      return { ...fallback, fallbackUsed: true }
    }

    const rows = history.slice(1).map((value, index) => ({
      y: value,
      lag1: history[index],
      time: index + 1
    }))

    const xtx = [
      [rows.length, 0, 0],
      [0, 0, 0],
      [0, 0, 0]
    ]
    const xty = [0, 0, 0]

    rows.forEach(({ y, lag1, time }) => {
      xtx[0][1] += lag1
      xtx[0][2] += time
      xtx[1][0] += lag1
      xtx[1][1] += lag1 * lag1
      xtx[1][2] += lag1 * time
      xtx[2][0] += time
      xtx[2][1] += lag1 * time
      xtx[2][2] += time * time

      xty[0] += y
      xty[1] += y * lag1
      xty[2] += y * time
    })

    const coefficients = solve3x3(xtx, xty)
    if (!coefficients) {
      const fallback = holtModel.run(history, horizon)
      return { ...fallback, fallbackUsed: true }
    }

    const [intercept, lagWeight, trendWeight] = coefficients
    const results: number[] = []
    let prev = history.at(-1) ?? 0

    for (let step = 1; step <= horizon; step += 1) {
      const time = rows.length + step
      const prediction = clampNonNegative(intercept + lagWeight * prev + trendWeight * time)
      results.push(prediction)
      prev = prediction
    }

    return {
      values: results,
      fallbackUsed: false
    }
  }
}

export const FORECAST_MODELS: ForecastModel[] = [naiveModel, sesModel, holtModel, lagRegressionModel]
