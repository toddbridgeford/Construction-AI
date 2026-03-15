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

const fetchCensusVipSeries = async (): Promise<unknown> => {
  const endpoint = process.env.CENSUS_VIP_API_URL
  if (!endpoint) return []

  const response = await fetch(endpoint, {
    headers: {
      Accept: 'application/json',
      ...(process.env.CENSUS_VIP_API_KEY ? { Authorization: `Bearer ${process.env.CENSUS_VIP_API_KEY}` } : {})
    }
  })

  if (!response.ok) {
    throw new Error(`Census VIP request failed with ${response.status}`)
  }

  return parseVipPayload(await response.json())
}

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
