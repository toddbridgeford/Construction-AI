import { useEffect, useMemo, useState } from 'react'

import { mapDataByIndicator, toSeries } from '@/components/dashboard/dataTransforms'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import type { DashboardData, GeographyLevel } from '@/data/types'
import type { ForecastOutput } from '@/forecasting'
import { createDataProvider } from '@/providers/providerFactory'
import usStateGeometry from '@/data/us-state-geometry.json'

const providerBundle = createDataProvider()
const provider = providerBundle.provider

type RangeOption = 'all' | '10y' | '5y' | '3y' | '1y'
type IndicatorOption = { label: string; value: string }

type KpiCardData = {
  label: string
  value: number
  yoy: number | null
  mom: number | null
  icon: string
}

const geographyLevels: IndicatorOption[] = [
  { label: 'United States', value: 'us' },
  { label: 'Region', value: 'region' },
  { label: 'State', value: 'state' },
  { label: 'Metro', value: 'metro' }
]

const rangePeriods: Record<RangeOption, number> = {
  all: Number.POSITIVE_INFINITY,
  '10y': 120,
  '5y': 60,
  '3y': 36,
  '1y': 12
}

const emptyForecastOutput: ForecastOutput = {
  horizon: 12,
  bestModel: 'naive',
  forecast: [],
  comparison: [],
  validationWindow: 0,
  warnings: []
}

const fmtPct = (value: number | null) => (value == null || Number.isNaN(value) ? 'N/A' : `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`)
const pct = (current: number | undefined, previous: number | undefined) => {
  if (current == null || previous == null || previous === 0) return null
  return ((current - previous) / previous) * 100
}
const toneClass = (value: number | null) => (value == null ? 'text-slate-400' : value >= 0 ? 'text-emerald-300' : 'text-rose-300')

type GeoPoint = [number, number]
type MapFeature = {
  type: 'Feature'
  properties: { stateId: string; stateName: string }
  geometry: { type: 'Polygon'; coordinates: GeoPoint[][] }
}

const DASHBOARD_COPY = {
  subtitle: 'Interactive market dashboard with forecast monitoring',
  mapTitlePermits: 'Building Permits by State',
  mapTitleEmployment: 'Construction Employment by State',
  mapSubtitle: 'Nationwide choropleth coverage with drill-down for supported states.',
  forecastUnavailable: 'Forecast unavailable for this selection.',
  mapNoData: 'No index value available'
} as const

const mapFeatures = (usStateGeometry.features ?? []) as MapFeature[]

const projectPoint = (lon: number, lat: number) => {
  const x = ((lon + 125) / 59) * 360 + 20
  const y = ((49 - lat) / 24) * 220 + 20
  return [x, y] as const
}

const polygonToPath = (ring: GeoPoint[]) =>
  ring.map(([lon, lat], index) => `${index === 0 ? 'M' : 'L'} ${projectPoint(lon, lat)[0].toFixed(2)} ${projectPoint(lon, lat)[1].toFixed(2)}`).join(' ') + ' Z'

function App() {
  const [isDarkMode, setIsDarkMode] = useState(true)
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [forecastLoading, setForecastLoading] = useState(false)
  const [forecastError, setForecastError] = useState<string | null>(null)
  const [providerStatus, setProviderStatus] = useState(providerBundle.runtime.getStatus())

  const [geographyLevel, setGeographyLevel] = useState<GeographyLevel>('us')
  const [regionId, setRegionId] = useState('northeast')
  const [stateId, setStateId] = useState('CA')
  const [metroId, setMetroId] = useState('los-angeles-ca')
  const [indicatorId, setIndicatorId] = useState('permits')
  const [forecastHorizon, setForecastHorizon] = useState<'3' | '6' | '12'>('12')
  const [compareModels, setCompareModels] = useState(false)
  const [range, setRange] = useState<RangeOption>('5y')
  const [brushStart, setBrushStart] = useState(0)
  const [brushEnd, setBrushEnd] = useState(100)
  const [mapMetric, setMapMetric] = useState<'permits' | 'employment'>('permits')
  const [hoverMap, setHoverMap] = useState<{ state: string; value: number } | null>(null)
  const [chartHover, setChartHover] = useState<{ date: string; value: number } | null>(null)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode)
  }, [isDarkMode])

  useEffect(() => {
    let isActive = true

    const load = async () => {
      setLoading(true)
      setLoadError(null)

      try {
        const next = await provider.getDashboardData()
        if (!isActive) return
        setDashboardData(next)
      } catch {
        if (!isActive) return
        setDashboardData(null)
        setLoadError('Unable to load dashboard data. Try refreshing the page.')
      } finally {
        if (!isActive) return
        setProviderStatus(providerBundle.runtime.getStatus())
        setLoading(false)
      }
    }

    void load()

    return () => {
      isActive = false
    }
  }, [])

  const metadata = dashboardData?.metadata
  const observations = dashboardData?.observations ?? []

  const regionOptions = useMemo(() => metadata?.geography.regions.map((item) => ({ label: item.name, value: item.id })) ?? [], [metadata])
  const stateOptions = useMemo(
    () =>
      (metadata?.geography.states ?? [])
        .filter((state) => (geographyLevel === 'state' || geographyLevel === 'metro' || geographyLevel === 'region' ? state.regionId === regionId : true))
        .map((state) => ({ label: state.name, value: state.id })),
    [geographyLevel, metadata, regionId]
  )
  const metroOptions = useMemo(
    () => (metadata?.geography.metros ?? []).filter((metro) => metro.stateId === stateId).map((metro) => ({ label: metro.name, value: metro.id })),
    [metadata, stateId]
  )

  useEffect(() => {
    if (stateOptions.length && !stateOptions.some((entry) => entry.value === stateId)) setStateId(stateOptions[0].value)
  }, [stateId, stateOptions])

  useEffect(() => {
    if (metroOptions.length && !metroOptions.some((entry) => entry.value === metroId)) setMetroId(metroOptions[0].value)
  }, [metroId, metroOptions])

  const indicators = useMemo(
    () => (metadata?.indicators ?? []).filter((indicator) => indicator.geographyLevels.includes(geographyLevel)),
    [geographyLevel, metadata]
  )

  useEffect(() => {
    if (indicators.length && !indicators.some((entry) => entry.id === indicatorId)) {
      setIndicatorId(indicators[0].id)
    }
  }, [indicatorId, indicators])

  const geographyId = geographyLevel === 'us' ? 'us' : geographyLevel === 'region' ? regionId : geographyLevel === 'state' ? stateId : metroId

  const seriesByIndicator = useMemo(
    () =>
      Object.fromEntries(
        ['permits', 'starts', 'employment', 'cost_index'].map((id) => [id, toSeries(observations, geographyLevel, geographyId, id).points])
      ) as Record<string, { date: string; value: number }[]>,
    [observations, geographyId, geographyLevel]
  )

  const primarySeries = useMemo(() => toSeries(observations, geographyLevel, geographyId, indicatorId).points, [geographyId, geographyLevel, indicatorId, observations])

  const filteredSeries = useMemo(() => {
    const cap = rangePeriods[range]
    return Number.isFinite(cap) ? primarySeries.slice(-cap) : primarySeries
  }, [primarySeries, range])

  const brushedSeries = useMemo(() => {
    if (!filteredSeries.length) return []
    const start = Math.floor((brushStart / 100) * (filteredSeries.length - 1))
    const end = Math.max(start + 2, Math.floor((brushEnd / 100) * (filteredSeries.length - 1)))
    return filteredSeries.slice(start, Math.min(end + 1, filteredSeries.length))
  }, [brushEnd, brushStart, filteredSeries])

  useEffect(() => {
    setBrushStart(0)
    setBrushEnd(100)
  }, [geographyId, geographyLevel, indicatorId, range])

  const [forecastOutput, setForecastOutput] = useState<ForecastOutput>(emptyForecastOutput)

  useEffect(() => {
    let isActive = true

    const loadForecast = async () => {
      setForecastLoading(true)
      setForecastError(null)

      try {
        const response = await provider.getForecast({
          geographyLevel,
          geographyId,
          indicatorId,
          periods: Number(forecastHorizon) as 3 | 6 | 12
        })
        if (!isActive) return
        setForecastOutput(response.output)
      } catch {
        if (!isActive) return
        setForecastOutput(emptyForecastOutput)
        setForecastError(DASHBOARD_COPY.forecastUnavailable)
      } finally {
        if (!isActive) return
        setProviderStatus(providerBundle.runtime.getStatus())
        setForecastLoading(false)
      }
    }

    void loadForecast()

    return () => {
      isActive = false
    }
  }, [forecastHorizon, geographyId, geographyLevel, indicatorId])

  const kpiCards = useMemo<KpiCardData[]>(() => {
    const starts = seriesByIndicator.starts
    const permits = seriesByIndicator.permits
    const employment = seriesByIndicator.employment
    const costs = seriesByIndicator.cost_index

    const startsLatest = starts.at(-1)?.value ?? 0
    const permitsLatest = permits.at(-1)?.value ?? 0
    const employmentLatest = employment.at(-1)?.value ?? 0
    const costLatest = costs.at(-1)?.value ?? 0

    const mortgageProxy = 8.5 - costLatest / 35
    const abiProxy = (permitsLatest * 0.55 + employmentLatest * 0.45) / 2

    return [
      { label: 'Housing Starts', value: startsLatest, yoy: pct(startsLatest, starts.at(-13)?.value), mom: pct(startsLatest, starts.at(-2)?.value), icon: '◼' },
      { label: 'Building Permits', value: permitsLatest, yoy: pct(permitsLatest, permits.at(-13)?.value), mom: pct(permitsLatest, permits.at(-2)?.value), icon: '◻' },
      { label: 'Employment', value: employmentLatest, yoy: pct(employmentLatest, employment.at(-13)?.value), mom: pct(employmentLatest, employment.at(-2)?.value), icon: '◼' },
      {
        label: '30Y Mortgage',
        value: mortgageProxy,
        yoy: pct(mortgageProxy, 8.5 - ((costs.at(-13)?.value ?? costLatest) / 35)),
        mom: pct(mortgageProxy, 8.5 - ((costs.at(-2)?.value ?? costLatest) / 35)),
        icon: '◻'
      },
      { label: 'Materials PPI', value: costLatest, yoy: pct(costLatest, costs.at(-13)?.value), mom: pct(costLatest, costs.at(-2)?.value), icon: '◼' },
      {
        label: 'ABI Index',
        value: abiProxy,
        yoy: pct(abiProxy, ((permits.at(-13)?.value ?? permitsLatest) * 0.55 + (employment.at(-13)?.value ?? employmentLatest) * 0.45) / 2),
        mom: pct(abiProxy, ((permits.at(-2)?.value ?? permitsLatest) * 0.55 + (employment.at(-2)?.value ?? employmentLatest) * 0.45) / 2),
        icon: '◻'
      }
    ]
  }, [seriesByIndicator])

  const mapEntries = useMemo(() => mapDataByIndicator(dashboardData?.mapData ?? [], mapMetric), [dashboardData?.mapData, mapMetric])
  const mapEntriesByState = useMemo(() => new Map(mapEntries.map((entry) => [entry.stateId, entry])), [mapEntries])

  const mapExtent = useMemo(() => {
    const values = mapEntries.map((entry) => entry.value)
    return { min: Math.min(...values, 0), max: Math.max(...values, 1) }
  }, [mapEntries])

  const chartDomain = useMemo(() => {
    const values = [
      ...brushedSeries.map((point) => point.value),
      ...forecastOutput.forecast.map((point) => point.value),
      ...forecastOutput.forecast.map((point) => point.lowerBound),
      ...forecastOutput.forecast.map((point) => point.upperBound)
    ]
    return {
      min: Math.min(...values, 0),
      max: Math.max(...values, 1)
    }
  }, [brushedSeries, forecastOutput.forecast])

  const totalChartPoints = brushedSeries.length + forecastOutput.forecast.length
  const toX = (index: number) => (index / Math.max(totalChartPoints - 1, 1)) * 100
  const toY = (value: number) => 100 - ((value - chartDomain.min) / Math.max(chartDomain.max - chartDomain.min, 1)) * 100

  const historicalPath = brushedSeries.map((point, index) => `${index === 0 ? 'M' : 'L'} ${toX(index)} ${toY(point.value)}`).join(' ')

  const forecastPath =
    brushedSeries.length && forecastOutput.forecast.length
      ? [
          `M ${toX(brushedSeries.length - 1)} ${toY(brushedSeries.at(-1)?.value ?? 0)}`,
          ...forecastOutput.forecast.map((point, index) => `L ${toX(brushedSeries.length + index)} ${toY(point.value)}`)
        ].join(' ')
      : ''

  const bandPath =
    brushedSeries.length && forecastOutput.forecast.length
      ? [
          ...forecastOutput.forecast.map((point, index) => `${index === 0 ? 'M' : 'L'} ${toX(brushedSeries.length + index)} ${toY(point.upperBound)}`),
          ...[...forecastOutput.forecast]
            .reverse()
            .map((point, reverseIndex) => {
              const index = forecastOutput.forecast.length - reverseIndex - 1
              return `L ${toX(brushedSeries.length + index)} ${toY(point.lowerBound)}`
            }),
          'Z'
        ].join(' ')
      : ''

  const selectedLabel =
    geographyLevel === 'us'
      ? 'United States'
      : geographyLevel === 'region'
        ? regionOptions.find((entry) => entry.value === regionId)?.label ?? regionId
        : geographyLevel === 'state'
        ? stateOptions.find((entry) => entry.value === stateId)?.label ?? stateId
        : metroOptions.find((entry) => entry.value === metroId)?.label ?? metroId
  const mapMetricLabel = mapMetric === 'permits' ? 'permits index' : 'employment index'
  const hasMapValues = mapEntries.some((entry) => Number.isFinite(entry.value))
  const hasForecast = forecastOutput.forecast.length > 0

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/70 bg-[#0b1120]">
        <div className="mx-auto flex w-full max-w-[1320px] items-center justify-between px-3 py-2 md:px-4">
          <div className="flex items-center gap-2.5">
            <div className="grid h-7 w-7 place-items-center rounded border border-border/70 bg-[#121a2b] text-[10px] font-semibold text-slate-200">US</div>
            <div className="leading-tight">
              <p className="text-[12px] font-semibold text-slate-100">U.S. Construction Market</p>
              <p className="text-[10px] text-slate-400">{DASHBOARD_COPY.subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="rounded border border-border/70 px-2 py-1 text-[9px] text-slate-400">{providerStatus.label}</span>
            <button className="h-6 w-6 rounded border border-border/70 text-[10px] text-slate-400 transition hover:text-slate-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-300/60" aria-label="Dashboard information">i</button>
            <button className="h-6 w-6 rounded border border-border/70 text-[10px] text-slate-400 transition hover:text-slate-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-300/60" onClick={() => setIsDarkMode((prev) => !prev)} aria-label="Toggle theme">{isDarkMode ? '☀' : '☾'}</button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1320px] flex-col gap-2.5 px-3 py-3 md:px-4">
        <section className="rounded border border-border/70 bg-[#121a2b] px-2 py-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Select options={geographyLevels} value={geographyLevel} onChange={(value) => setGeographyLevel(value as GeographyLevel)} className="h-7 bg-[#0f1626] text-[10px]" />
            {geographyLevel !== 'us' && <Select options={regionOptions} value={regionId} onChange={setRegionId} className="h-7 bg-[#0f1626] text-[10px]" />}
            {(geographyLevel === 'state' || geographyLevel === 'metro') && <Select options={stateOptions} value={stateId} onChange={setStateId} className="h-7 bg-[#0f1626] text-[10px]" />}
            {geographyLevel === 'metro' && <Select options={metroOptions} value={metroId} onChange={setMetroId} className="h-7 bg-[#0f1626] text-[10px]" />}
            <Select options={indicators.map((item) => ({ label: item.name, value: item.id }))} value={indicatorId} onChange={setIndicatorId} className="h-7 bg-[#0f1626] text-[10px]" />
            <Select
              options={[
                { label: '3M', value: '3' },
                { label: '6M', value: '6' },
                { label: '12M', value: '12' }
              ]}
              value={forecastHorizon}
              onChange={(value) => setForecastHorizon(value as '3' | '6' | '12')}
              className="h-7 min-w-[4.5rem] bg-[#0f1626] text-[10px]"
            />
            <div className="inline-flex items-center gap-2 rounded border border-border/70 bg-[#0f1626] px-2 py-1 text-[10px] text-slate-400">
              Compare models
              <Switch checked={compareModels} onCheckedChange={setCompareModels} />
            </div>
          </div>
        </section>

        <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
          {kpiCards.map((card) => (
            <Card key={card.label} className="border-border/70 bg-[#121a2b]">
              <CardContent className="p-2.5">
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-[10px] text-slate-400">{card.label}</p>
                  <span className="font-mono text-[8px] text-slate-500">{card.icon}</span>
                </div>
                <p className="font-mono text-[18px] leading-none text-slate-100">{card.label === '30Y Mortgage' ? `${card.value.toFixed(2)}%` : card.value.toFixed(1)}</p>
                <div className="mt-2 flex justify-between text-[10px]">
                  <span className={toneClass(card.yoy)}>YoY {fmtPct(card.yoy)}</span>
                  <span className={toneClass(card.mom)}>MoM {fmtPct(card.mom)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="grid gap-2 xl:grid-cols-[1.06fr_0.94fr]">
          <Card className="border-border/70 bg-[#121a2b]">
            <CardHeader className="border-b border-border/60 pb-2">
              <div className="flex items-start justify-between gap-2">
                <div className="leading-tight">
                  <CardTitle className="text-[12px]">{mapMetric === 'permits' ? DASHBOARD_COPY.mapTitlePermits : DASHBOARD_COPY.mapTitleEmployment}</CardTitle>
                  <p className="text-[10px] text-slate-400">{DASHBOARD_COPY.mapSubtitle}</p>
                </div>
                <div className="inline-flex rounded border border-border/70 bg-[#0f1626] p-0.5 text-[9px]">
                  <button aria-pressed={mapMetric === 'permits'} className={`rounded px-2 py-0.5 transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-300/60 ${mapMetric === 'permits' ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:text-slate-200'}`} onClick={() => setMapMetric('permits')}>Permits</button>
                  <button aria-pressed={mapMetric === 'employment'} className={`rounded px-2 py-0.5 transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-300/60 ${mapMetric === 'employment' ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:text-slate-200'}`} onClick={() => setMapMetric('employment')}>Employment</button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="h-[304px] p-3">
              <div className="relative h-full rounded border border-border/70 bg-[#0e1628] p-2.5">
                <svg viewBox="0 0 430 260" className="h-full w-full">
                  <rect x="8" y="10" width="356" height="216" rx="8" fill="rgba(15,23,42,0.45)" stroke="rgba(148,163,184,0.2)" strokeWidth="1" />
                  {mapFeatures.map((feature) => {
                    const item = mapEntriesByState.get(feature.properties.stateId)
                    const ratio = item ? Math.max(0, Math.min(1, (item.value - mapExtent.min) / Math.max(mapExtent.max - mapExtent.min, 1))) : 0
                    const fill = item ? `rgba(245, 158, ${Math.max(26, Math.round(80 - ratio * 54))}, ${0.24 + ratio * 0.62})` : 'rgba(71,85,105,0.2)'
                    const outerRing = feature.geometry.coordinates[0] ?? []

                    return (
                      <path
                        key={feature.properties.stateId}
                        d={polygonToPath(outerRing)}
                        fill={fill}
                        stroke={item ? 'rgba(245,158,11,0.6)' : 'rgba(148,163,184,0.24)'}
                        strokeWidth="1"
                        className={item ? 'cursor-pointer' : 'cursor-default'}
                        onMouseEnter={() => setHoverMap({ state: item?.stateName ?? feature.properties.stateName, value: item?.value ?? Number.NaN })}
                        onMouseLeave={() => setHoverMap(null)}
                        onClick={() => {
                          if (!item) return
                          setGeographyLevel('state')
                          const region = metadata?.geography.states.find((entry) => entry.id === item.stateId)?.regionId
                          if (region) setRegionId(region)
                          setStateId(item.stateId)
                        }}
                      />
                    )
                  })}
                </svg>

                {hoverMap && (
                  <div className="absolute left-2.5 top-2.5 rounded border border-border/70 bg-[#070c18]/95 px-2 py-1 text-[10px]">
                    <p className="font-medium text-slate-100">{hoverMap.state}</p>
                    <p className="font-mono text-slate-400">{Number.isFinite(hoverMap.value) ? `${hoverMap.value.toFixed(1)} ${mapMetricLabel}` : DASHBOARD_COPY.mapNoData}</p>
                  </div>
                )}

                {hasMapValues ? (
                  <div className="pointer-events-none absolute bottom-2.5 right-2.5 rounded border border-border/70 bg-[#070c18]/95 px-2 py-1 text-[9px] text-slate-400">
                    <p className="mb-0.5">Low → High</p>
                    <div className="h-1.5 w-20 rounded bg-gradient-to-r from-slate-600/60 to-amber-400/80" />
                  </div>
                ) : (
                  <div className="pointer-events-none absolute bottom-2.5 right-2.5 rounded border border-border/70 bg-[#070c18]/95 px-2 py-1 text-[9px] text-slate-500">{DASHBOARD_COPY.mapNoData}.</div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-[#121a2b]">
            <CardHeader className="border-b border-border/60 pb-2">
              <div className="flex items-start justify-between gap-2">
                <div className="leading-tight">
                  <CardTitle className="text-[12px]">{indicators.find((entry) => entry.id === indicatorId)?.name ?? indicatorId}</CardTitle>
                  <p className="text-[10px] text-slate-400">{selectedLabel}: historical (white) with {forecastHorizon}-month forecast projection (orange).</p>
                </div>
                <span className="rounded border border-amber-300/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] uppercase text-amber-300">Model: {forecastLoading ? 'updating' : hasForecast ? forecastOutput.bestModel : 'unavailable'}</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 p-3">
              <div className="relative h-[222px] rounded border border-border/70 bg-[#0e1628] p-2">
                {loading ? (
                  <div className="grid h-full place-items-center text-[11px] text-slate-400">Loading series…</div>
                ) : loadError ? (
                  <div className="grid h-full place-items-center text-[11px] text-rose-300">{loadError}</div>
                ) : !brushedSeries.length ? (
                  <div className="grid h-full place-items-center text-[11px] text-slate-400">No data for selected filter.</div>
                ) : (
                  <svg viewBox="0 0 100 100" className="h-full w-full" onMouseLeave={() => setChartHover(null)}>
                    {[20, 40, 60, 80].map((y) => <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="rgba(148,163,184,0.14)" strokeWidth="0.35" />)}
                    {bandPath && <path d={bandPath} fill="rgba(245,158,11,0.12)" />}
                    <path d={historicalPath} fill="none" stroke="#f8fafc" strokeWidth="1.2" />
                    {forecastPath && <path d={forecastPath} fill="none" stroke="#f59e0b" strokeWidth="1.2" strokeDasharray="2 1.6" />}
                    {brushedSeries.map((point, index) => (
                      <circle key={point.date} cx={toX(index)} cy={toY(point.value)} r={0.56} fill="#f8fafc" onMouseEnter={() => setChartHover({ date: point.date, value: point.value })} />
                    ))}
                  </svg>
                )}

                {chartHover && (
                  <div className="absolute right-2 top-2 rounded border border-border/70 bg-[#070c18]/95 px-2 py-1 text-[10px]">
                    <p className="font-mono text-slate-200">{chartHover.date}</p>
                    <p className="font-mono text-slate-400">{chartHover.value.toFixed(1)}</p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-1 rounded border border-border/70 bg-[#0f1626] p-1.5 text-[10px] text-slate-400">
                <div>Selected: <span className="font-mono text-slate-200">{selectedLabel}</span></div>
                <div>Validation: <span className="font-mono text-slate-200">{forecastOutput.validationWindow} mo</span></div>
                <div>{forecastLoading ? 'Updating forecast…' : compareModels ? `${forecastOutput.comparison.length} models compared` : 'Comparison off'}</div>
              </div>

              {compareModels && (
                <div className="rounded border border-border/70 bg-[#0f1626] px-2 py-1.5 text-[10px] text-slate-300">
                  {forecastOutput.comparison.length === 0 ? (
                    <p className="text-slate-400">No comparison metrics available for this selection.</p>
                  ) : (
                    <div className="grid gap-1">
                      {forecastOutput.comparison.slice(0, 4).map((entry) => (
                        <div key={entry.model} className="flex items-center justify-between">
                          <span className={entry.model === forecastOutput.bestModel ? 'text-amber-300' : 'text-slate-300'}>{entry.model}</span>
                          <span className="font-mono text-slate-400">RMSE {entry.rmse.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {forecastError && <div className="rounded border border-rose-300/30 bg-rose-500/10 px-2 py-1 text-[10px] text-rose-200">{forecastError}</div>}

              <div className="rounded border border-border/70 bg-[#0f1626] px-2 py-1.5">
                <div className="mb-1 flex items-center justify-between text-[10px] text-slate-400">
                  <span>Range brush</span>
                  <span className="font-mono">{brushedSeries[0]?.date ?? '—'} → {brushedSeries.at(-1)?.date ?? '—'}</span>
                </div>
                <div className="grid gap-1">
                  <input className="accent-amber-400" type="range" min={0} max={95} value={brushStart} aria-label="Brush start" onChange={(event) => setBrushStart(Math.min(Number(event.target.value), brushEnd - 5))} />
                  <input className="accent-amber-400" type="range" min={5} max={100} value={brushEnd} aria-label="Brush end" onChange={(event) => setBrushEnd(Math.max(Number(event.target.value), brushStart + 5))} />
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="inline-flex rounded border border-border/70 bg-[#121a2b] p-0.5">
          {(['all', '10y', '5y', '3y', '1y'] as RangeOption[]).map((option) => (
            <button
              key={option}
              aria-pressed={range === option}
              className={`rounded px-2.5 py-1 text-[10px] uppercase transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-300/60 ${range === option ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:text-slate-200'}`}
              onClick={() => setRange(option)}
            >
              {option}
            </button>
          ))}
        </section>

        <Card className="border-border/70 bg-[#121a2b]">
          <CardHeader className="pb-1.5">
            <CardTitle className="text-[12px]">Methodology and sources</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-[10.5px] leading-relaxed text-slate-400 md:grid-cols-2">
            <div className="space-y-1 rounded border border-border/65 bg-[#0f1626] p-2">
              <p className="text-[10px] uppercase tracking-[0.08em] text-slate-200">Data Sources</p>
              <p>Core indicators are served through the checked-in provider contract, with local synthetic fallback when live credentials are unavailable.</p>
              <p>Current panels are wired to permits, starts, employment, and materials cost index series from the repository dataset.</p>
            </div>
            <div className="space-y-1 rounded border border-border/65 bg-[#0f1626] p-2">
              <p className="text-[10px] uppercase tracking-[0.08em] text-slate-200">Forecasting</p>
              <p>The existing engine compares naive, SES, Holt, and lag-regression models and selects by validation RMSE.</p>
              <p>Forecast bands are derived from residual volatility and available history length.</p>
            </div>
            <div className="space-y-1 rounded border border-border/65 bg-[#0f1626] p-2 md:col-span-2">
              <p className="text-[10px] uppercase tracking-[0.08em] text-slate-200">Limitations</p>
              <p>30Y Mortgage and ABI are proxy calculations from available indicators so the dashboard stays grounded in the current contract without unsupported feeds.</p>
              {forecastOutput.warnings.length > 0 && <p className="text-amber-200">Forecast warning: {forecastOutput.warnings.join(' ')}</p>}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

export default App
