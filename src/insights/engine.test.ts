import { buildInsights, insightClassifiers } from './engine'

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message)
}

assert(insightClassifiers.classifyDirection(1.2) === 'up', 'Positive change should classify as up')
assert(insightClassifiers.classifyDirection(-1.2) === 'down', 'Negative change should classify as down')
assert(insightClassifiers.classifyDirection(0.1) === 'flat', 'Small changes should classify as flat')

const volatileSeries = [100, 112, 97, 118, 92, 121, 88].map((value, index) => ({
  date: new Date(Date.UTC(2024, index, 1)).toISOString().slice(0, 10),
  value
}))

assert(insightClassifiers.evaluateVolatility(volatileSeries).strength !== 'low', 'Large swings should trigger elevated volatility')

const improvingButFragile = buildInsights({
  indicatorId: 'permits',
  indicatorName: 'Permit Momentum',
  geographyLevel: 'state',
  geographyLabel: 'California',
  series: Array.from({ length: 14 }, (_, index) => ({
    date: new Date(Date.UTC(2023, index, 1)).toISOString().slice(0, 10),
    value: 100 + index * 2
  })),
  comparison: {
    label: 'Input Cost Pressure',
    indicatorId: 'cost_index',
    series: Array.from({ length: 14 }, (_, index) => ({
      date: new Date(Date.UTC(2023, index, 1)).toISOString().slice(0, 10),
      value: 125 - index
    }))
  },
  forecastEnabled: true,
  forecast: {
    horizon: 6,
    bestModel: 'holt',
    validationWindow: 6,
    comparison: [],
    warnings: [],
    forecast: Array.from({ length: 6 }, (_, index) => ({
      date: new Date(Date.UTC(2025, index, 1)).toISOString().slice(0, 10),
      value: 130 + index * 1.2,
      lowerBound: 95 + index * 0.5,
      upperBound: 180 + index * 2
    }))
  }
})

assert(improvingButFragile.summary.headline.length > 0, 'Insights should produce a non-empty summary headline')
assert(
  improvingButFragile.actionableInterpretation.some((entry) => entry.toLowerCase().includes('capacity') || entry.toLowerCase().includes('staged')),
  'Actionable interpretation should include deterministic execution guidance'
)

export {}
