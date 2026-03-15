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
        { period: '2024-02-01', amount: '2105', unit: 'million dollars' },
        { month: '2024-03', observation: '2111', unit: 'million dollars' },
        { date: '2024-04-01', value: '2118', unit: 'million dollars' },
        { date: '2024-05-01', value: '2124', unit: 'million dollars' },
        { date: '2024-06-01', value: '2130', unit: 'million dollars' },
        { date: '2024-07-01', value: '2136', unit: 'million dollars' },
        { date: '2024-08-01', value: '2142', unit: 'million dollars' },
        { date: '2024-09-01', value: '2148', unit: 'million dollars' },
        { date: '2024-10-01', value: '2154', unit: 'million dollars' },
        { date: '2024-11-01', value: '2160', unit: 'million dollars' },
        { date: '2024-12-01', value: '2166', unit: 'million dollars' },
        { time: '2025-01-01', observation_value: '2230', unit: 'million dollars' },
        { date: '202502', value: '2240', unit: 'million dollars' },
        { date: '2025-03-01', value: '2250', unit: 'million dollars' }
      ]
    }
  )

  assert(success.status === 200, 'Expected success status 200')
  if ('error' in success.body) throw new Error('Expected success payload, got error payload')
  assert(success.body.metric === 'construction_spending', 'Expected construction_spending metric')
  assert(success.body.unit === 'usd-billion', 'Expected top-level usd-billion unit')
  assert(success.body.source.id === 'census_vip', 'Expected census_vip source id')
  assert(success.body.source.unit === 'usd-billion', 'Expected usd-billion unit')
  assert(success.body.sourceStatus === 'live', 'Expected live source status')
  assert(success.body.series.length === 15, 'Expected fifteen monthly points')
  assert(success.body.series[0].date === '2024-01', 'Expected normalized YYYY-MM date')
  assert(success.body.series[0].value === 2.098, 'Expected millions normalized to billions')
  assert(success.body.series[0].mom === null, 'Expected first MoM to be null')
  assert(success.body.series[0].yoy === null, 'Expected first YoY to be null')
  assert(success.body.series[14].mom === 0.4, 'Expected derived MoM for latest point')
  assert(success.body.series[12].yoy === 6.3, 'Expected derived YoY when 12-month history exists')
  assert(success.body.cache.hit === false && success.body.cache.stale === false, 'Expected cache envelope defaults')

  const pending = await getMacroSeriesResponse(
    { metric: 'construction_spending' },
    {
      now: fixedNow,
      fetchCensusVipSeries: async () => []
    }
  )

  assert(pending.status === 200, 'Expected pending status 200')
  if ('error' in pending.body) throw new Error('Expected pending payload, got error payload')
  assert(pending.body.sourceStatus === 'pending', 'Expected pending sourceStatus for empty usable payload')
  assert(pending.body.series.length === 0, 'Expected empty series for pending payload')

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

  const unsupported = await getMacroSeriesResponse(
    { metric: 'abi' },
    {
      now: fixedNow,
      fetchCensusVipSeries: async () => []
    }
  )

  assert(unsupported.status === 400, 'Expected unsupported metric status 400')
  assert('error' in unsupported.body, 'Expected unsupported metric error payload')
}

await run()

export {}
