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

  const abiSuccess = await getMacroSeriesResponse(
    { metric: 'abi' },
    {
      now: fixedNow,
      fetchCensusVipSeries: async () => [],
      fetchAbiSeries: async () => [
        { date: '2024-11-01', value: 49.5 },
        { date: '2024-12-01', value: 50.2 },
        { month: '2025-01', observation: '51.3' }
      ]
    }
  )

  assert(abiSuccess.status === 200, 'Expected ABI success status 200')
  if ('error' in abiSuccess.body) throw new Error('Expected ABI payload, got error payload')
  assert(abiSuccess.body.metric === 'abi', 'Expected abi metric')
  assert(abiSuccess.body.unit === 'index', 'Expected ABI unit index')
  assert(abiSuccess.body.source.id === 'aia_abi', 'Expected ABI source id')
  assert(abiSuccess.body.source.transformType === 'diffusion', 'Expected ABI diffusion transform type')
  assert(abiSuccess.body.sourceStatus === 'live', 'Expected ABI live source status')
  assert(abiSuccess.body.series.length === 3, 'Expected ABI points')
  assert(abiSuccess.body.series[2].value === 51.3, 'Expected ABI latest value')
  assert(abiSuccess.body.series[2].date === '2025-01', 'Expected ABI YYYY-MM normalized date')
  assert(abiSuccess.body.series[1].mom === null && abiSuccess.body.series[1].yoy === null, 'Expected ABI rates null for truthful diffusion semantics')

  const abiPending = await getMacroSeriesResponse(
    { metric: 'abi' },
    {
      now: fixedNow,
      fetchCensusVipSeries: async () => [],
      fetchAbiSeries: async () => []
    }
  )

  assert(abiPending.status === 200, 'Expected ABI pending status 200')
  if ('error' in abiPending.body) throw new Error('Expected ABI pending payload, got error payload')
  assert(abiPending.body.sourceStatus === 'pending', 'Expected ABI pending sourceStatus for empty payload')
  assert(abiPending.body.series.length === 0, 'Expected ABI empty series for pending payload')

  const abiFixtureNormalized = await getMacroSeriesResponse(
    { metric: 'abi' },
    {
      now: fixedNow,
      fetchCensusVipSeries: async () => [],
      fetchAbiSeries: async () => [
        { release_date: '2024-11-30', abi_index: '48.6' },
        { date: '202412', billings_index: 49.8 },
        { period: '2025-01-01', abi: '50.4' }
      ]
    }
  )

  assert(abiFixtureNormalized.status === 200, 'Expected ABI fixture normalization status 200')
  if ('error' in abiFixtureNormalized.body) throw new Error('Expected ABI fixture payload, got error payload')
  assert(abiFixtureNormalized.body.sourceStatus === 'live', 'Expected ABI fixture to normalize into live status')
  assert(abiFixtureNormalized.body.series[0].date === '2024-11', 'Expected ABI release_date normalization')
  assert(abiFixtureNormalized.body.series[2].value === 50.4, 'Expected ABI alternate value key normalization')

  const nahbSuccess = await getMacroSeriesResponse(
    { metric: 'nahb_hmi' },
    {
      now: fixedNow,
      fetchCensusVipSeries: async () => [],
      fetchNahbHmiSeries: async () => [
        { period: '2024-12-01', amount: '46' },
        { time: '2025-01-01', observation_value: '47' }
      ]
    }
  )

  assert(nahbSuccess.status === 200, 'Expected NAHB HMI success status 200')
  if ('error' in nahbSuccess.body) throw new Error('Expected NAHB HMI payload, got error payload')
  assert(nahbSuccess.body.metric === 'nahb_hmi', 'Expected nahb_hmi metric')
  assert(nahbSuccess.body.unit === 'index', 'Expected NAHB HMI unit index')
  assert(nahbSuccess.body.source.id === 'nahb_hmi', 'Expected NAHB HMI source id')
  assert(nahbSuccess.body.source.transformType === 'diffusion', 'Expected NAHB HMI diffusion transform type')
  assert(nahbSuccess.body.sourceStatus === 'live', 'Expected NAHB HMI live source status')
  assert(nahbSuccess.body.series.length === 2, 'Expected NAHB HMI points')
  assert(nahbSuccess.body.series[0].date === '2024-12', 'Expected NAHB HMI YYYY-MM normalized date')
  assert(nahbSuccess.body.series[1].mom === null && nahbSuccess.body.series[1].yoy === null, 'Expected NAHB HMI rates null for truthful diffusion semantics')

  const nahbPending = await getMacroSeriesResponse(
    { metric: 'nahb_hmi' },
    {
      now: fixedNow,
      fetchCensusVipSeries: async () => [],
      fetchNahbHmiSeries: async () => []
    }
  )

  assert(nahbPending.status === 200, 'Expected NAHB HMI pending status 200')
  if ('error' in nahbPending.body) throw new Error('Expected NAHB HMI pending payload, got error payload')
  assert(nahbPending.body.sourceStatus === 'pending', 'Expected NAHB HMI pending sourceStatus for empty payload')
  assert(nahbPending.body.series.length === 0, 'Expected NAHB HMI empty series for pending payload')

  const nahbFixtureNormalized = await getMacroSeriesResponse(
    { metric: 'nahb_hmi' },
    {
      now: fixedNow,
      fetchCensusVipSeries: async () => [],
      fetchNahbHmiSeries: async () => [
        { release_date: '2024-11-20', hmi_index: '41' },
        { month: '2024-12', index: 45 },
        { time: '2025-01-01', hmi: '47' }
      ]
    }
  )

  assert(nahbFixtureNormalized.status === 200, 'Expected NAHB HMI fixture normalization status 200')
  if ('error' in nahbFixtureNormalized.body) throw new Error('Expected NAHB HMI fixture payload, got error payload')
  assert(nahbFixtureNormalized.body.sourceStatus === 'live', 'Expected NAHB fixture to normalize into live status')
  assert(nahbFixtureNormalized.body.series[0].date === '2024-11', 'Expected NAHB release_date normalization')
  assert(nahbFixtureNormalized.body.series[2].value === 47, 'Expected NAHB alternate value key normalization')

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
    { metric: 'unknown_metric' },
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
