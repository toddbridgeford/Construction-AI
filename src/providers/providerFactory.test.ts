import { adaptFredPayload } from './live/adapters/fredAdapter'
import { buildLiveSources, createDataProvider } from './providerFactory'

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message)
}

const demoBundle = createDataProvider({})
assert(demoBundle.runtime.getStatus().label === 'Demo Mode', 'Missing env should keep demo provider mode')

const liveSources = buildLiveSources({ baseUrl: 'https://example.com', apiKey: 'token' })
assert(liveSources.length >= 6, 'Live source list should include primary and scaffold providers')

const fred = adaptFredPayload({ observations: [{ date: '2024-01-01', value: '123.4' }] })
assert(fred.observations.length === 1, 'FRED adapter should normalize observations')
assert(fred.observations[0].indicatorId === 'permits', 'FRED adapter should map indicator to permits')

export {}
