import { LocalJsonProvider } from './LocalJsonProvider'
import { ApiProvider } from './ApiProvider'
import { ProviderRuntime } from './runtime'
import type { DataProvider } from './types'
import type { LiveSourceConfig } from './live/types'

export type LiveProviderEnv = {
  baseUrl?: string
  apiKey?: string
}

export type ProviderBundle = {
  provider: DataProvider
  runtime: ProviderRuntime
}

const readEnv = (): LiveProviderEnv => ({
  baseUrl: import.meta.env.VITE_API_BASE_URL,
  apiKey: import.meta.env.VITE_API_KEY
})

const hasLiveConfig = (env: LiveProviderEnv): boolean => Boolean(env.baseUrl)

export const buildLiveSources = (env: LiveProviderEnv): LiveSourceConfig[] => [
  { id: 'fred', name: 'FRED Building Permits', path: '/fred', query: { series_id: 'PERMIT' }, apiKey: env.apiKey, indicatorId: 'permits', required: true },
  { id: 'fred', name: 'FRED 30Y Mortgage', path: '/fred', query: { series_id: 'MORTGAGE30US' }, apiKey: env.apiKey, indicatorId: 'mortgage30y', required: true },
  { id: 'bls', name: 'BLS Construction Employment', path: '/bls', query: { series_id: 'CES2000000001' }, apiKey: env.apiKey, indicatorId: 'employment', required: true },
  { id: 'census', name: 'Census Housing Starts', path: '/census', query: { dataset: 'starts', geography: 'us' }, apiKey: env.apiKey, indicatorId: 'starts', required: true },
  { id: 'census', name: 'Census State Permits Map', path: '/census', query: { dataset: 'state_permits', geography: 'state' }, apiKey: env.apiKey, indicatorId: 'permits', required: false },
  { id: 'hud', name: 'HUD', path: '/hud', apiKey: env.apiKey, indicatorId: 'permits', required: false },
  { id: 'bea', name: 'BEA', path: '/bea', apiKey: env.apiKey, indicatorId: 'employment', required: false }
]

export function createDataProvider(env = readEnv()): ProviderBundle {
  const runtime = new ProviderRuntime()
  const localProvider = new LocalJsonProvider(runtime)

  if (!hasLiveConfig(env)) {
    runtime.setStatus({ mode: 'demo', label: 'Demo Mode', degradedSources: [], usedFallback: false, message: 'Live env vars missing. Running local demo dataset.' })
    return { provider: localProvider, runtime }
  }

  return {
    provider: new ApiProvider({
      baseUrl: env.baseUrl!,
      apiKey: env.apiKey,
      sources: buildLiveSources(env),
      fallbackProvider: localProvider,
      runtime
    }),
    runtime
  }
}
