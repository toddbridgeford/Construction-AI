import { getMacroSeriesResponse } from './macroSeries'

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message)
}

const fixedNow = () => new Date('2026-03-15T16:30:00Z')

const run = async () => {
  const success = await getMacroSeriesResponse(
    { metric: 'construction_spending' },
    {
      now: fixedNow,
      fetchCensusVipSeries: async () => [
        { date: '2024-01-01', value: '2098', unit: 'million dollars' },
        { date: '2024-02-01', value: '2105', unit: 'million dollars' },
        { date: '2024-03-01', value: '2111', unit: 'million dollars' },
        { date: '2025-01-01', value: '2230', unit: 'million dollars' },
        { date: '2025-02-01', value: '2240', unit: 'million dollars' },
        { date: '2025-03-01', value: '2250', unit: 'million dollars' }
      ]
    }
  )

  assert(success.status === 200, 'Expected success status 200')
  if ('error' in success.body) throw new Error('Expected success payload, got error payload')
  assert(success.body.metric === 'construction_spending', 'Expected construction_spending metric')
  assert(success.body.source.id === 'census_vip', 'Expected census_vip source id')
  assert(success.body.source.unit === 'usd-billion', 'Expected usd-billion unit')
  assert(success.body.sourceStatus === 'live', 'Expected live source status')
  assert(success.body.series.length === 6, 'Expected six monthly points')
  assert(success.body.series[0].date === '2024-01', 'Expected normalized YYYY-MM date')
  assert(success.body.series[0].value === 2.098, 'Expected millions normalized to billions')
  assert(success.body.series[0].mom === null, 'Expected first MoM to be null')
  assert(success.body.series[0].yoy === null, 'Expected first YoY to be null')
  assert(success.body.series[5].mom === 0.4, 'Expected derived MoM for latest point')
  assert(success.body.series[3].yoy === 6.3, 'Expected derived YoY when 12-month history exists')

  const unavailable = await getMacroSeriesResponse(
    { metric: 'construction_spending' },
    {
      now: fixedNow,
      fetchCensusVipSeries: async () => {
        throw new Error('upstream unavailable')
      }
    }
  )

  assert(unavailable.status === 200, 'Expected unavailable status 200')
  if ('error' in unavailable.body) throw new Error('Expected unavailable payload, got error payload')
  assert(unavailable.body.sourceStatus === 'error', 'Expected error sourceStatus on upstream failure')
  assert(unavailable.body.series.length === 0, 'Expected empty series when upstream unavailable')
  assert(typeof unavailable.body.message === 'string' && unavailable.body.message.length > 0, 'Expected failure message')
}

await run()

export {}
