import { generateForecast } from './engine'
import { mae, rmse } from './metrics'

const assert = (condition: boolean, message: string) => {
  if (!condition) {
    throw new Error(message)
  }
}

const actual = [10, 12, 14]
const predicted = [9, 11, 13]
assert(Math.abs(rmse(actual, predicted) - 1) < 0.0001, 'RMSE should be 1 for unit offset series')
assert(Math.abs(mae(actual, predicted) - 1) < 0.0001, 'MAE should be 1 for unit offset series')

const longSeries = Array.from({ length: 36 }, (_, index) => ({
  date: new Date(Date.UTC(2020, index, 1)).toISOString().slice(0, 10),
  value: 100 + index * 2
}))

const comparisonOutput = generateForecast(longSeries, 6)
assert(comparisonOutput.comparison.length === 4, 'All four models should be evaluated')
assert(
  comparisonOutput.comparison[0].rmse <= comparisonOutput.comparison[1].rmse,
  'Model comparison should be ordered by RMSE ascending'
)
assert(comparisonOutput.bestModel === comparisonOutput.comparison[0].model, 'Best model should match lowest RMSE entry')

const sparseSeries = Array.from({ length: 18 }, (_, index) => ({
  date: new Date(Date.UTC(2022, index, 1)).toISOString().slice(0, 10),
  value: index % 2 === 0 ? 5 : 0
}))

const sanityOutput = generateForecast(sparseSeries, 3)
assert(sanityOutput.forecast.length === 3, 'Forecast horizon should control output count')
assert(
  sanityOutput.forecast.every((point) => point.value >= 0 && point.lowerBound >= 0 && point.upperBound >= point.value),
  'Forecast points should be floored at zero with valid confidence bounds'
)

export {}
