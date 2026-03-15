import { defineConfig, type Plugin } from 'vite'
import { getMacroSeriesResponse } from './src/backend/macroSeries'

declare const process: { env: Record<string, string | undefined> }

const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
} as const

const parseUpstreamPayload = (payload: unknown): unknown => {
  if (Array.isArray(payload)) return payload
  if (!payload || typeof payload !== 'object') return []

  const candidate = payload as Record<string, unknown>
  const nestedArray =
    candidate.data ??
    candidate.results ??
    candidate.result ??
    candidate.series ??
    candidate.observations ??
    candidate.values ??
    candidate.items
  return Array.isArray(nestedArray) ? nestedArray : []
}

type UpstreamRequestOptions = {
  endpoint?: string
  apiKey?: string
  apiKeyHeader?: string
  apiKeyQueryParam?: string
}

const fetchSeriesFromEndpoint = async ({ endpoint, apiKey, apiKeyHeader, apiKeyQueryParam }: UpstreamRequestOptions): Promise<unknown> => {
  if (!endpoint) return []

  const url = new URL(endpoint)
  if (apiKey && apiKeyQueryParam) {
    url.searchParams.set(apiKeyQueryParam, apiKey)
  }

  const authHeader = apiKey && !apiKeyQueryParam ? { Authorization: `Bearer ${apiKey}` } : {}
  const customHeader = apiKey && apiKeyHeader ? { [apiKeyHeader]: apiKey } : {}

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      ...authHeader,
      ...customHeader
    }
  })

  if (!response.ok) {
    throw new Error(`Series request failed with ${response.status}`)
  }

  return parseUpstreamPayload(await response.json())
}

const fetchCensusVipSeries = async (): Promise<unknown> => {
  return fetchSeriesFromEndpoint({
    endpoint: process.env.CENSUS_VIP_API_URL,
    apiKey: process.env.CENSUS_VIP_API_KEY,
    apiKeyHeader: process.env.CENSUS_VIP_API_KEY_HEADER,
    apiKeyQueryParam: process.env.CENSUS_VIP_API_KEY_QUERY_PARAM
  })
}

const fetchAbiSeries = async (): Promise<unknown> =>
  fetchSeriesFromEndpoint({
    endpoint: process.env.AIA_ABI_API_URL,
    apiKey: process.env.AIA_ABI_API_KEY,
    apiKeyHeader: process.env.AIA_ABI_API_KEY_HEADER,
    apiKeyQueryParam: process.env.AIA_ABI_API_KEY_QUERY_PARAM
  })

const fetchNahbHmiSeries = async (): Promise<unknown> =>
  fetchSeriesFromEndpoint({
    endpoint: process.env.NAHB_HMI_API_URL,
    apiKey: process.env.NAHB_HMI_API_KEY,
    apiKeyHeader: process.env.NAHB_HMI_API_KEY_HEADER,
    apiKeyQueryParam: process.env.NAHB_HMI_API_KEY_QUERY_PARAM
  })

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
