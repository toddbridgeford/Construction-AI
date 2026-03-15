export type ForecastModelName = 'naive' | 'ses' | 'holt' | 'lagRegression'

export type ForecastPoint = {
  date: string
  value: number
  lowerBound: number
  upperBound: number
}

export type ModelResult = {
  model: ForecastModelName
  rmse: number
  mae: number
  forecast: ForecastPoint[]
  fallbackUsed: boolean
}

export type ForecastOutput = {
  horizon: 3 | 6 | 12
  bestModel: ForecastModelName
  forecast: ForecastPoint[]
  comparison: ModelResult[]
  validationWindow: number
  warnings: string[]
}
