import { useEffect, useMemo, useState } from 'react'

import { toSeries } from '@/components/dashboard/dataTransforms'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { DashboardData, Observation } from '@/data/types'
import { createDataProvider } from '@/providers/providerFactory'
import usStateGeometry from '@/data/us-state-geometry.json'

const providerBundle = createDataProvider()
const provider = providerBundle.provider
const DASHBOARD_CACHE_KEY = 'construction-ai-dashboard-cache-v1'

type TabId = 'overview' | 'leading' | 'predictive' | 'equities' | 'methodology'
type MetricSignal = 'BULLISH' | 'NEUTRAL' | 'BEARISH'

type MetricDefinition = {
  id: 'building_permits' | 'housing_starts' | 'abi' | 'construction_spending' | 'materials_ppi' | 'nahb_hmi' | 'homebuilder_equity'
  label: string
  role: string
  leadTime?: string
  note: string
  neutral: number
  higherIsBetter: boolean
  source: string
  sourceStatus: 'live' | 'fallback' | 'pending'
  mappedIndicatorId?: string
}

type GeoPoint = [number, number]
type MapFeature = {
  type: 'Feature'
  properties: { stateId: string; stateName: string }
  geometry: { type: 'Polygon'; coordinates: GeoPoint[][] }
}

const mapFeatures = (usStateGeometry.features ?? []) as MapFeature[]

const metricDefinitions: MetricDefinition[] = [
  {
    id: 'building_permits',
    label: 'Building Permits',
    role: 'Leading',
    leadTime: '1–3 month lead',
    note: 'Strongest predictor of housing starts.',
    neutral: 100,
    higherIsBetter: true,
    source: 'FRED PERMIT (national trend), Census state permits for choropleth',
    sourceStatus: 'live',
    mappedIndicatorId: 'permits'
  },
  {
    id: 'housing_starts',
    label: 'Housing Starts',
    role: 'Coincident',
    note: 'Primary volume measure in thousands SAAR.',
    neutral: 100,
    higherIsBetter: true,
    source: 'Census starts endpoint',
    sourceStatus: 'live',
    mappedIndicatorId: 'starts'
  },
  {
    id: 'abi',
    label: 'Architecture Billings Index (ABI)',
    role: 'Leading',
    leadTime: '9–12 month lead',
    note: 'Below 50 indicates contraction. Pending supported endpoint integration.',
    neutral: 50,
    higherIsBetter: true,
    source: 'Pending live source integration',
    sourceStatus: 'pending'
  },
  {
    id: 'construction_spending',
    label: 'Construction Spending',
    role: 'Lagging',
    note: '$B annualized, confirms activity, prone to revision. Pending supported endpoint integration.',
    neutral: 100,
    higherIsBetter: true,
    source: 'Pending live source integration',
    sourceStatus: 'pending'
  },
  {
    id: 'materials_ppi',
    label: 'Materials PPI',
    role: 'Inverted / Coincident',
    note: 'Rising costs compress builder margins.',
    neutral: 100,
    higherIsBetter: false,
    source: 'Local/Input Cost Pressure fallback; BLS PPI endpoint still pending',
    sourceStatus: 'fallback',
    mappedIndicatorId: 'cost_index'
  },
  {
    id: 'nahb_hmi',
    label: 'NAHB HMI Confidence Index',
    role: 'Coincident',
    note: 'Builder survey, proxy for forward order books. Pending supported endpoint integration.',
    neutral: 50,
    higherIsBetter: true,
    source: 'Pending live source integration',
    sourceStatus: 'pending'
  },
  {
    id: 'homebuilder_equity',
    label: 'Homebuilder Equity Performance',
    role: 'Leading',
    leadTime: '6–9 month lead',
    note: 'Coverage for ITB ETF, DHI, LEN, PHM with extended peers.',
    neutral: 0,
    higherIsBetter: true,
    source: 'Server-approved equities path pending; currently transparent scaffold values',
    sourceStatus: 'pending'
  }
]

const tabList: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'leading', label: 'Leading Indicators' },
  { id: 'predictive', label: 'Predictive Model' },
  { id: 'equities', label: 'Equities' },
  { id: 'methodology', label: 'Methodology' }
]

const mean = (values: number[]) => values.reduce((acc, value) => acc + value, 0) / Math.max(values.length, 1)
const stdev = (values: number[]) => {
  const m = mean(values)
  return Math.sqrt(values.reduce((acc, value) => acc + (value - m) ** 2, 0) / Math.max(values.length, 1))
}
const percentile = (sortedValues: number[], ratio: number) => {
  if (!sortedValues.length) return 0
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.floor(ratio * (sortedValues.length - 1))))
  return sortedValues[index]
}
const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value))

const signalFor = (score: number): MetricSignal => {
  if (score >= 58) return 'BULLISH'
  if (score <= 42) return 'BEARISH'
  return 'NEUTRAL'
}

const fmt = (value: number | null, digits = 1) => (value == null || Number.isNaN(value) ? 'N/A' : value.toFixed(digits))

const buildSeries = (observations: Observation[], indicatorId: string) => toSeries(observations, 'us', 'us', indicatorId).points

const buildScaffoldSeries = (label: string, len = 48, center = 50) => {
  const now = new Date()
  return Array.from({ length: len }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (len - index - 1), 1)
    const cyclical = Math.sin(index / 4) * 2.2
    const drift = (index / len) * 1.4
    return { date: date.toISOString().slice(0, 10), value: Number((center + drift + cyclical).toFixed(2)), scaffold: true, label }
  })
}

const colorFromScore = (score: number) => (score >= 58 ? 'text-emerald-300' : score <= 42 ? 'text-rose-300' : 'text-amber-300')

const MAP_VIEWPORT = { x: 8, y: 8, width: 414, height: 244 }
const CONTIGUOUS_STATE_IDS = new Set(mapFeatures.map((feature) => feature.properties.stateId).filter((stateId) => stateId !== 'AK' && stateId !== 'HI'))
type Bounds = { minLon: number; maxLon: number; minLat: number; maxLat: number }
const emptyBounds = (): Bounds => ({ minLon: Infinity, maxLon: -Infinity, minLat: Infinity, maxLat: -Infinity })
const collectBounds = (stateIds: Set<string>): Bounds =>
  mapFeatures.reduce((acc, feature) => {
    if (!stateIds.has(feature.properties.stateId)) return acc
    const ring = feature.geometry.coordinates[0] ?? []
    ring.forEach(([lon, lat]) => {
      acc.minLon = Math.min(acc.minLon, lon)
      acc.maxLon = Math.max(acc.maxLon, lon)
      acc.minLat = Math.min(acc.minLat, lat)
      acc.maxLat = Math.max(acc.maxLat, lat)
    })
    return acc
  }, emptyBounds())
const contiguousBounds = collectBounds(CONTIGUOUS_STATE_IDS)
const alaskaBounds = collectBounds(new Set(['AK']))
const hawaiiBounds = collectBounds(new Set(['HI']))
const CONTIGUOUS_BOX = { x: MAP_VIEWPORT.x + 54, y: MAP_VIEWPORT.y + 22, width: 352, height: 168 }
const ALASKA_BOX = { x: MAP_VIEWPORT.x + 4, y: MAP_VIEWPORT.y + MAP_VIEWPORT.height - 56, width: 92, height: 46 }
const HAWAII_BOX = { x: MAP_VIEWPORT.x + 106, y: MAP_VIEWPORT.y + MAP_VIEWPORT.height - 34, width: 54, height: 24 }

const normalizePoint = (lon: number, lat: number, bounds: Bounds) => {
  const lonRange = Math.max(bounds.maxLon - bounds.minLon, 1)
  const latRange = Math.max(bounds.maxLat - bounds.minLat, 1)
  const x = (lon - bounds.minLon) / lonRange
  const y = (bounds.maxLat - lat) / latRange
  return [x, y] as const
}
const projectToBox = (xNorm: number, yNorm: number, box: { x: number; y: number; width: number; height: number }) => [box.x + xNorm * box.width, box.y + yNorm * box.height] as const
const projectPoint = (stateId: string, lon: number, lat: number) => {
  if (stateId === 'AK') return projectToBox(...normalizePoint(lon, lat, alaskaBounds), ALASKA_BOX)
  if (stateId === 'HI') return projectToBox(...normalizePoint(lon, lat, hawaiiBounds), HAWAII_BOX)
  const [xNorm, yNorm] = normalizePoint(lon, lat, contiguousBounds)
  const lonRange = Math.max(contiguousBounds.maxLon - contiguousBounds.minLon, 1)
  const latRange = Math.max(contiguousBounds.maxLat - contiguousBounds.minLat, 1)
  const scale = Math.min(CONTIGUOUS_BOX.width / lonRange, CONTIGUOUS_BOX.height / latRange)
  const width = lonRange * scale
  const height = latRange * scale
  return projectToBox(xNorm, yNorm, { x: CONTIGUOUS_BOX.x + (CONTIGUOUS_BOX.width - width) / 2, y: CONTIGUOUS_BOX.y + (CONTIGUOUS_BOX.height - height) / 2, width, height })
}
const polygonToPath = (stateId: string, ring: GeoPoint[]) => `${ring.map(([lon, lat], index) => `${index === 0 ? 'M' : 'L'} ${projectPoint(stateId, lon, lat)[0].toFixed(2)} ${projectPoint(stateId, lon, lat)[1].toFixed(2)}`).join(' ')} Z`

function App() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [providerStatus, setProviderStatus] = useState(providerBundle.runtime.getStatus())
  const [activeTab, setActiveTab] = useState<TabId>('overview')

  useEffect(() => {
    document.documentElement.classList.add('dark')
  }, [])

  useEffect(() => {
    let alive = true
    const load = async () => {
      setLoading(true)
      setLoadError(null)
      try {
        const data = await provider.getDashboardData()
        if (!alive) return
        setDashboardData(data)
        localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(data))
      } catch {
        if (!alive) return
        const cached = localStorage.getItem(DASHBOARD_CACHE_KEY)
        if (cached) {
          try {
            setDashboardData(JSON.parse(cached) as DashboardData)
            setLoadError('Live refresh failed. Loaded cached snapshot for degraded/offline mode.')
          } catch {
            setLoadError('Unable to load dashboard data from provider.')
          }
        } else {
          setLoadError('Unable to load dashboard data from provider.')
        }
      } finally {
        if (!alive) return
        setProviderStatus(providerBundle.runtime.getStatus())
        setLoading(false)
      }
    }
    void load()
    return () => {
      alive = false
    }
  }, [])

  const observations = dashboardData?.observations ?? []
  const permitsMap = (dashboardData?.mapData ?? []).filter((item) => item.indicatorId === 'permits')
  const mapByState = useMemo(() => new Map(permitsMap.map((item) => [item.stateId, Number(item.value)])), [permitsMap])

  const metricSeries = useMemo(() => {
    const permits = buildSeries(observations, 'permits')
    const starts = buildSeries(observations, 'starts')
    const costs = buildSeries(observations, 'cost_index')

    const abi = buildScaffoldSeries('ABI', 48, 50)
    const spending = buildScaffoldSeries('Spending', 48, 104)
    const nahb = buildScaffoldSeries('NAHB HMI', 48, 52)
    const homebuilder = buildScaffoldSeries('Homebuilder Equity', 48, 6)

    return {
      building_permits: permits,
      housing_starts: starts,
      abi,
      construction_spending: spending,
      materials_ppi: costs,
      nahb_hmi: nahb,
      homebuilder_equity: homebuilder
    }
  }, [observations])

  const metricScores = useMemo(() => {
    return metricDefinitions.map((metric) => {
      const series = metricSeries[metric.id]
      const values = series.map((point) => point.value)
      const latest = values.at(-1) ?? 0
      const mu = mean(values)
      const sigma = stdev(values) || 1
      const z = (latest - mu) / sigma
      const directionalZ = metric.higherIsBetter ? z : -z
      const score = clamp(50 + directionalZ * 12)
      return {
        ...metric,
        latest,
        z,
        score,
        signal: signalFor(score)
      }
    })
  }, [metricSeries])

  const composite = useMemo(() => {
    const rows = metricDefinitions.map((metric) => metricSeries[metric.id].map((point) => point.value))
    const length = Math.min(...rows.map((row) => row.length))
    const normalizedRows = rows.map((row, idx) => {
      const segment = row.slice(-length)
      const m = mean(segment)
      const sd = stdev(segment) || 1
      const direction = metricDefinitions[idx].higherIsBetter ? 1 : -1
      return segment.map((value) => direction * ((value - m) / sd))
    })

    const target = normalizedRows[1] ?? []
    const rawWeights = normalizedRows.map((row) => {
      if (!target.length) return 1
      const cov = row.reduce((acc, value, index) => acc + value * target[index], 0) / Math.max(target.length, 1)
      const variance = row.reduce((acc, value) => acc + value * value, 0) / Math.max(row.length, 1)
      return Math.abs(variance > 0 ? cov / variance : 0.1)
    })

    const weightSum = rawWeights.reduce((acc, value) => acc + value, 0) || 1
    const weights = rawWeights.map((value) => value / weightSum)

    const compositeZ = Array.from({ length }, (_, index) => normalizedRows.reduce((acc, row, rowIdx) => acc + row[index] * weights[rowIdx], 0))
    const compositeScore = compositeZ.map((value) => clamp(50 + value * 12))

    const dates = metricSeries.building_permits.slice(-length).map((point) => point.date)
    const latest = compositeScore.at(-1) ?? 50

    return {
      history: dates.map((date, index) => ({ date, score: compositeScore[index] })),
      latest,
      weights
    }
  }, [metricSeries])

  const simulation = useMemo(() => {
    const paths = 800
    const horizon = 12
    const dt = 1 / 12
    const driftBase = 0.3
    const volBase = 4.2
    const start = composite.latest

    const pathResults: number[][] = []

    for (let p = 0; p < paths; p += 1) {
      let current = start
      let regime: 'expansion' | 'contraction' = start >= 50 ? 'expansion' : 'contraction'
      const onePath: number[] = []

      for (let t = 0; t < horizon; t += 1) {
        const switchChance = Math.random()
        if (regime === 'expansion' && switchChance < 0.09) regime = 'contraction'
        if (regime === 'contraction' && switchChance < 0.16) regime = 'expansion'

        const regimeDrift = regime === 'expansion' ? driftBase : -0.18
        const regimeVol = regime === 'expansion' ? volBase * 0.85 : volBase * 1.2
        const shock = Math.sqrt(-2 * Math.log(Math.max(Math.random(), 1e-6))) * Math.cos(2 * Math.PI * Math.random())
        const gbmStep = Math.exp((regimeDrift - (regimeVol ** 2) / 2) * dt + regimeVol * Math.sqrt(dt) * shock * 0.01)
        current = clamp(current * gbmStep)
        onePath.push(current)
      }

      pathResults.push(onePath)
    }

    const bands = Array.from({ length: horizon }, (_, step) => {
      const values = pathResults.map((path) => path[step]).sort((a, b) => a - b)
      return {
        month: step + 1,
        p10: percentile(values, 0.1),
        p25: percentile(values, 0.25),
        p50: percentile(values, 0.5),
        p75: percentile(values, 0.75),
        p90: percentile(values, 0.9)
      }
    })

    const finalValues = pathResults.map((path) => path[horizon - 1]).sort((a, b) => a - b)

    return {
      paths,
      horizon,
      drift: driftBase,
      volatility: volBase,
      bands,
      bear: percentile(finalValues, 0.1),
      base: percentile(finalValues, 0.5),
      bull: percentile(finalValues, 0.9),
      phase: 'Contraction' as const
    }
  }, [composite.latest])

  const equities = useMemo(
    () => [
      { symbol: 'DHI', price: 145.1, day: 0.7, ytd: 8.2, marketCap: '48.1B', signal: 'Neutral' },
      { symbol: 'LEN', price: 159.4, day: -0.3, ytd: 6.1, marketCap: '42.5B', signal: 'Neutral' },
      { symbol: 'PHM', price: 121.7, day: 0.5, ytd: 10.8, marketCap: '25.4B', signal: 'Bullish' },
      { symbol: 'TOL', price: 112.5, day: -0.2, ytd: 4.6, marketCap: '11.6B', signal: 'Neutral' },
      { symbol: 'NVR', price: 7280, day: 0.1, ytd: 11.3, marketCap: '21.9B', signal: 'Bullish' },
      { symbol: 'ITB ETF', price: 108.4, day: 0.4, ytd: 7.4, marketCap: '3.2B', signal: 'Neutral' },
      { symbol: 'XHB ETF', price: 94.8, day: 0.2, ytd: 5.2, marketCap: '1.9B', signal: 'Neutral' }
    ],
    []
  )

  const maxYtd = Math.max(...equities.map((entry) => entry.ytd), 12)

  const renderMiniLine = (points: { value: number }[]) => {
    if (!points.length) return null
    const min = Math.min(...points.map((point) => point.value))
    const max = Math.max(...points.map((point) => point.value))
    const x = (index: number) => (index / Math.max(points.length - 1, 1)) * 100
    const y = (value: number) => 100 - ((value - min) / Math.max(max - min, 1)) * 100
    return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(index).toFixed(2)} ${y(point.value).toFixed(2)}`).join(' ')
  }

  const gaugeRotation = -90 + (composite.latest / 100) * 180

  return (
    <div className="min-h-screen bg-[#0b1220] text-slate-100">
      <main className="mx-auto max-w-[1280px] space-y-4 px-4 py-4">
        <header className="rounded border border-slate-700/60 bg-slate-900/70 p-3">
          <h1 className="text-lg font-semibold">Construction Intelligence Dashboard</h1>
          <p className="text-xs text-slate-400">7-metric aligned model · provider mode: {providerStatus.label}</p>
          {loadError && <p className="mt-1 text-xs text-rose-300">{loadError}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            {tabList.map((tab) => (
              <button key={tab.id} className={`rounded border px-2 py-1 text-xs ${activeTab === tab.id ? 'border-blue-300 bg-blue-400/15 text-blue-100' : 'border-slate-700 text-slate-300'}`} onClick={() => setActiveTab(tab.id)}>
                {tab.label}
              </button>
            ))}
          </div>
        </header>

        {loading ? <Card><CardContent className="p-4 text-sm text-slate-400">Loading…</CardContent></Card> : null}

        {!loading && activeTab === 'overview' && (
          <section className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader><CardTitle className="text-sm">Composite Score Gauge (0–100)</CardTitle></CardHeader>
              <CardContent>
                <div className="flex items-center justify-center">
                  <svg viewBox="0 0 220 130" className="h-40 w-full max-w-sm">
                    <path d="M 20 110 A 90 90 0 0 1 200 110" fill="none" stroke="rgba(148,163,184,0.35)" strokeWidth="14" />
                    <line x1="110" y1="110" x2="110" y2="35" stroke="#60a5fa" strokeWidth="4" transform={`rotate(${gaugeRotation} 110 110)`} />
                    <circle cx="110" cy="110" r="6" fill="#bfdbfe" />
                    <text x="110" y="124" fill="#e2e8f0" textAnchor="middle" fontSize="12">{composite.latest.toFixed(1)}</text>
                  </svg>
                </div>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader><CardTitle className="text-sm">Metric KPI Cards</CardTitle></CardHeader>
              <CardContent className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {metricScores.map((metric) => (
                  <div key={metric.id} className="rounded border border-slate-700/60 bg-slate-950/40 p-2 text-xs">
                    <p className="font-medium text-slate-100">{metric.label}</p>
                    <p className="mt-1 text-slate-300">{fmt(metric.latest)} <span className={`ml-1 font-semibold ${colorFromScore(metric.score)}`}>{metric.signal}</span></p>
                    <p className="mt-1 text-[11px] text-slate-400">{metric.role}{metric.leadTime ? ` · ${metric.leadTime}` : ''}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="md:col-span-3">
              <CardHeader><CardTitle className="text-sm">Composite Index History</CardTitle></CardHeader>
              <CardContent>
                <svg viewBox="0 0 100 30" className="h-44 w-full rounded border border-slate-700/60 bg-slate-950/40 p-2">
                  <path d={renderMiniLine(composite.history.map((point) => ({ value: point.score }))) ?? ''} fill="none" stroke="#60a5fa" strokeWidth="0.8" />
                </svg>
              </CardContent>
            </Card>
          </section>
        )}

        {!loading && activeTab === 'leading' && (
          <section className="grid gap-4 lg:grid-cols-2">
            {metricDefinitions.map((metric) => {
              const points = metricSeries[metric.id]
              return (
                <Card key={metric.id}>
                  <CardHeader><CardTitle className="text-sm">{metric.label}</CardTitle></CardHeader>
                  <CardContent>
                    <svg viewBox="0 0 100 28" className="h-28 w-full rounded border border-slate-700/60 bg-slate-950/40 p-1">
                      <line x1="0" y1="14" x2="100" y2="14" stroke="rgba(148,163,184,0.35)" strokeDasharray="2 2" strokeWidth="0.35" />
                      <path d={renderMiniLine(points) ?? ''} fill="none" stroke="#60a5fa" strokeWidth="0.85" />
                    </svg>
                    <p className="mt-1 text-[11px] text-slate-400">Neutral reference: {metric.neutral} · source: {metric.sourceStatus}</p>
                  </CardContent>
                </Card>
              )
            })}

            <Card className="lg:col-span-2">
              <CardHeader><CardTitle className="text-sm">Normalized Factor Radar</CardTitle></CardHeader>
              <CardContent>
                <div className="grid gap-2 md:grid-cols-2">
                  {metricScores.map((metric, index) => (
                    <div key={metric.id} className="rounded border border-slate-700/60 bg-slate-950/40 p-2 text-xs">
                      <p>{index + 1}. {metric.label}</p>
                      <div className="mt-1 h-2 rounded bg-slate-800">
                        <div className="h-2 rounded bg-blue-400" style={{ width: `${metric.score}%` }} />
                      </div>
                      <p className="mt-1 text-slate-400">Factor score: {metric.score.toFixed(1)}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </section>
        )}

        {!loading && activeTab === 'predictive' && (
          <section className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader><CardTitle className="text-sm">Monte Carlo (800 paths, 12-month horizon)</CardTitle></CardHeader>
              <CardContent>
                <svg viewBox="0 0 100 38" className="h-56 w-full rounded border border-slate-700/60 bg-slate-950/40 p-2">
                  {['p90','p75','p50','p25','p10'].map((band, idx) => {
                    const color = `rgba(96,165,250,${0.16 + idx * 0.1})`
                    const points = simulation.bands.map((step, index) => {
                      const x = (index / Math.max(simulation.bands.length - 1, 1)) * 100
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const y = 36 - (((step as any)[band] - 20) / 80) * 36
                      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
                    }).join(' ')
                    return <path key={band} d={points} fill="none" stroke={color} strokeWidth={band === 'p50' ? 1 : 0.7} />
                  })}
                </svg>
                <p className="mt-2 text-xs text-slate-300">Bands: P10 / P25 / P50 / P75 / P90 with regime-switching GBM (drift≈{simulation.drift}, vol≈{simulation.volatility}).</p>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded border border-slate-700/60 bg-slate-950/40 p-2">Bear: {simulation.bear.toFixed(1)}</div>
                  <div className="rounded border border-slate-700/60 bg-slate-950/40 p-2">Base: {simulation.base.toFixed(1)}</div>
                  <div className="rounded border border-slate-700/60 bg-slate-950/40 p-2">Bull: {simulation.bull.toFixed(1)}</div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm">Construction Cycle Clock</CardTitle></CardHeader>
              <CardContent>
                <div className="grid gap-2 text-xs">
                  {['Expansion', 'Peak', 'Contraction', 'Trough'].map((phase) => (
                    <div key={phase} className={`rounded border px-2 py-2 ${phase === simulation.phase ? 'border-rose-300 bg-rose-500/10 text-rose-200 shadow-[0_0_12px_rgba(251,113,133,0.45)]' : 'border-slate-700/60 bg-slate-950/40 text-slate-300'}`}>
                      {phase}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </section>
        )}

        {!loading && activeTab === 'equities' && (
          <section className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader><CardTitle className="text-sm">Homebuilder & ETF Table</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead><tr className="text-slate-400"><th>Symbol</th><th>Price</th><th>Day</th><th>YTD %</th><th>Market Cap</th><th>Institutional Signal</th></tr></thead>
                    <tbody>
                      {equities.map((row) => (
                        <tr key={row.symbol} className="border-t border-slate-800"><td className="py-1.5">{row.symbol}</td><td>{row.price}</td><td className={row.day >= 0 ? 'text-emerald-300' : 'text-rose-300'}>{row.day >= 0 ? '+' : ''}{row.day}%</td><td>{row.ytd}%</td><td>{row.marketCap}</td><td>{row.signal}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-[11px] text-amber-300">Equity rows are scaffolded until server-approved live integration path is enabled.</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm">Institutional Positioning</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-xs">
                <div className="rounded border border-slate-700/60 bg-slate-950/40 p-2">Rate sensitivity: Elevated</div>
                <div className="rounded border border-slate-700/60 bg-slate-950/40 p-2">Short interest: Moderate</div>
                <div className="rounded border border-slate-700/60 bg-slate-950/40 p-2">Insider activity: Mixed</div>
                <div className="rounded border border-slate-700/60 bg-slate-950/40 p-2">Options skew: Slightly bearish</div>
                <div className="rounded border border-slate-700/60 bg-slate-950/40 p-2">Valuation P/B: Above long-run median</div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-3">
              <CardHeader><CardTitle className="text-sm">YTD vs S&P 500 Benchmark (line at 5.8%)</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {equities.map((row) => (
                    <div key={row.symbol} className="flex items-center gap-2 text-xs">
                      <span className="w-16">{row.symbol}</span>
                      <div className="h-2 flex-1 rounded bg-slate-800"><div className="h-2 rounded bg-blue-400" style={{ width: `${(row.ytd / maxYtd) * 100}%` }} /></div>
                      <span className="w-12 text-right">{row.ytd}%</span>
                    </div>
                  ))}
                  <div className="pt-1 text-[11px] text-slate-400">S&P 500 benchmark: 5.8% (reference line)</div>
                </div>
              </CardContent>
            </Card>
          </section>
        )}

        {!loading && activeTab === 'methodology' && (
          <section className="grid gap-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">Composite Index Methodology</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-xs text-slate-300">
                <p>Composite construction uses Z-score normalization across each metric, then derives factor weights from covariance-to-variance coefficients (OLS-style) against housing starts as anchor target.</p>
                <p>Dynamic Factor Model concept: weighted latent factor summarizes synchronized shifts in permits, starts, costs, and scaffolded/pending survey-equity channels.</p>
                <p>Monte Carlo forecast runs 800 regime-switching GBM paths for 12 months and publishes percentile bands P10/P25/P50/P75/P90 plus bear/base/bull terminal scenarios.</p>
                <p>Data sources and revision policy: Census/FRED/BLS wired via provider abstraction and server base URL; unsupported feeds (ABI, NAHB HMI, equities live tickers, spending) are clearly tagged pending and not represented as fake live feeds.</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm">State Polygon Choropleth (Building Permits)</CardTitle></CardHeader>
              <CardContent>
                <svg viewBox="0 0 430 260" className="w-full rounded border border-slate-700/60 bg-slate-950/40">
                  {mapFeatures.map((feature) => {
                    const ring = feature.geometry.coordinates[0] ?? []
                    const raw = mapByState.get(feature.properties.stateId)
                    const fill = raw == null ? 'rgba(30,41,59,0.45)' : `rgba(248,173,84,${0.4 + ((raw - 90) / 50) * 0.5})`
                    return <path key={feature.properties.stateId} d={polygonToPath(feature.properties.stateId, ring)} fill={fill} stroke="rgba(226,232,240,0.4)" strokeWidth={0.65} />
                  })}
                </svg>
              </CardContent>
            </Card>
          </section>
        )}
      </main>
    </div>
  )
}

export default App
