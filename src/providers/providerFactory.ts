import { LocalJsonProvider } from './LocalJsonProvider'
import { ApiProvider } from './ApiProvider'
import { ProviderRuntime } from './runtime'
import type { DataProvider } from './types'
import type { LiveSourceConfig } from './live/types'

export type LiveProviderEnv = {
  baseUrl?: string
  apiKey?: string
  fredApiKey?: string
  blsApiKey?: string
  censusApiKey?: string
  hudApiKey?: string
  beaApiKey?: string
}

export type ProviderBundle = {
  provider: DataProvider
  runtime: ProviderRuntime
}

const readEnv = (): LiveProviderEnv => ({
  baseUrl: import.meta.env.VITE_API_BASE_URL,
  apiKey: import.meta.env.VITE_API_KEY,
  fredApiKey: import.meta.env.VITE_FRED_API_KEY,
  blsApiKey: import.meta.env.VITE_BLS_API_KEY,
  censusApiKey: import.meta.env.VITE_CENSUS_API_KEY,
  hudApiKey: import.meta.env.VITE_HUD_API_KEY,
  beaApiKey: import.meta.env.VITE_BEA_API_KEY
})

const hasLiveConfig = (env: LiveProviderEnv): boolean => Boolean(env.baseUrl && (env.apiKey || env.fredApiKey || env.blsApiKey || env.censusApiKey))

export const buildLiveSources = (env: LiveProviderEnv): LiveSourceConfig[] => [
  { id: 'fred', name: 'FRED', path: '/fred', apiKey: env.fredApiKey ?? env.apiKey, indicatorId: 'permits', required: true },
  { id: 'bls', name: 'BLS', path: '/bls', apiKey: env.blsApiKey ?? env.apiKey, indicatorId: 'employment', required: true },
  { id: 'census', name: 'Census', path: '/census', apiKey: env.censusApiKey ?? env.apiKey, indicatorId: 'starts', required: false },
  { id: 'mortgage', name: 'Freddie Mac', path: '/mortgage', apiKey: env.apiKey, indicatorId: 'cost_index', required: false },
  { id: 'hud', name: 'HUD', path: '/hud', apiKey: env.hudApiKey ?? env.apiKey, indicatorId: 'permits', required: false },
  { id: 'bea', name: 'BEA', path: '/bea', apiKey: env.beaApiKey ?? env.apiKey, indicatorId: 'employment', required: false }
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
