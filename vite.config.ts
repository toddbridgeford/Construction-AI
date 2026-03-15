import { defineConfig, type Plugin } from 'vite'
import { getMacroSeriesResponse } from './src/backend/macroSeries'

declare const process: { env: Record<string, string | undefined> }

const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
} as const

const parseVipPayload = (payload: unknown): unknown => {
  if (Array.isArray(payload)) return payload
  if (!payload || typeof payload !== 'object') return []

  const candidate = payload as Record<string, unknown>
  const nestedArray = candidate.data ?? candidate.results ?? candidate.series ?? candidate.observations
  return Array.isArray(nestedArray) ? nestedArray : []
}

const fetchSeriesFromEndpoint = async (endpoint: string | undefined, apiKey: string | undefined): Promise<unknown> => {
  if (!endpoint) return []

  const response = await fetch(endpoint, {
    headers: {
      Accept: 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
    }
  })

  if (!response.ok) {
    throw new Error(`Series request failed with ${response.status}`)
  }

  return parseVipPayload(await response.json())
}

const fetchCensusVipSeries = async (): Promise<unknown> => {
  const endpoint = process.env.CENSUS_VIP_API_URL
  return fetchSeriesFromEndpoint(endpoint, process.env.CENSUS_VIP_API_KEY)
}

const fetchAbiSeries = async (): Promise<unknown> =>
  fetchSeriesFromEndpoint(process.env.AIA_ABI_API_URL, process.env.AIA_ABI_API_KEY)

const fetchNahbHmiSeries = async (): Promise<unknown> =>
  fetchSeriesFromEndpoint(process.env.NAHB_HMI_API_URL, process.env.NAHB_HMI_API_KEY)

const macroSeriesRoutePlugin = (): Plugin => {
  const middleware = async (req: any, res: any, next: () => void) => {
    if (!req.url) {
      next()
      return
    }

    const requestUrl = new URL(req.url, 'http://localhost')
    if (requestUrl.pathname !== '/api/macro-series') {
      next()
      return
    }

    const { status, body } = await getMacroSeriesResponse(
      { metric: requestUrl.searchParams.get('metric') ?? undefined },
      {
        fetchCensusVipSeries,
        fetchAbiSeries,
        fetchNahbHmiSeries,
        cache: { hit: false, stale: false }
      }
    )

    res.writeHead(status, jsonHeaders)
    res.end(JSON.stringify(body))
  }

  return {
    name: 'macro-series-runtime-route',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        void middleware(req, res, next)
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        void middleware(req, res, next)
      })
    }
  }
}

export default defineConfig({
  plugins: [macroSeriesRoutePlugin()],
  resolve: {
    alias: {
      '@': '/src'
    }
  }
})
