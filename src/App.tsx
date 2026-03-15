import { useEffect, useMemo, useState } from 'react'

import { mapDataByIndicator, toSeries } from '@/components/dashboard/dataTransforms'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import type { DashboardData, GeographyLevel } from '@/data/types'
import type { ForecastOutput } from '@/forecasting'
import { createDataProvider } from '@/providers/providerFactory'

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

type StatePolygon = {
  id: string
  d: string
  labelX: number
  labelY: number
}

const usStatePolygons: StatePolygon[] = [
  { id: 'WA', d: 'M 80 62 L 118 58 L 132 72 L 124 96 L 86 98 L 70 82 Z', labelX: 102, labelY: 80 },
  { id: 'CA', d: 'M 84 108 L 116 106 L 126 124 L 121 150 L 133 178 L 118 196 L 88 182 L 74 136 Z', labelX: 104, labelY: 150 },
  { id: 'TX', d: 'M 198 150 L 246 147 L 262 162 L 274 188 L 256 214 L 220 210 L 206 196 L 186 202 L 176 180 Z', labelX: 227, labelY: 181 },
  { id: 'IL', d: 'M 244 98 L 264 96 L 270 110 L 266 142 L 252 147 L 240 132 L 242 108 Z', labelX: 255, labelY: 124 },
  { id: 'NY', d: 'M 302 82 L 334 80 L 346 94 L 338 112 L 308 114 L 294 98 Z', labelX: 321, labelY: 98 },
  { id: 'FL', d: 'M 304 162 L 334 160 L 352 172 L 360 192 L 348 214 L 336 220 L 326 205 L 316 196 L 306 178 Z', labelX: 332, labelY: 188 }
]

function App() {
  const [isDarkMode, setIsDarkMode] = useState(true)
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
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
    const load = async () => {
      setLoading(true)
      const next = await provider.getDashboardData()
      setDashboardData(next)
      setProviderStatus(providerBundle.runtime.getStatus())
      setLoading(false)
    }

    void load()
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
    return filteredSeries.slice(start, end)
  }, [brushEnd, brushStart, filteredSeries])

  const [forecastOutput, setForecastOutput] = useState<ForecastOutput>(emptyForecastOutput)

  useEffect(() => {
    const loadForecast = async () => {
      const response = await provider.getForecast({
        geographyLevel,
        geographyId,
        indicatorId,
        periods: Number(forecastHorizon) as 3 | 6 | 12
      })
      setForecastOutput(response.output)
      setProviderStatus(providerBundle.runtime.getStatus())
    }

    void loadForecast()
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
      { label: 'Construction Spend', value: permitsLatest, yoy: pct(permitsLatest, permits.at(-13)?.value), mom: pct(permitsLatest, permits.at(-2)?.value), icon: '◻' },
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

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/70 bg-[#0b1120]">
        <div className="mx-auto flex w-full max-w-[1320px] items-center justify-between px-3 py-2 md:px-4">
          <div className="flex items-center gap-2.5">
            <div className="grid h-7 w-7 place-items-center rounded border border-border/70 bg-[#121a2b] text-[10px] font-semibold text-slate-200">US</div>
            <div className="leading-tight">
              <p className="text-[12px] font-semibold text-slate-100">U.S. Construction Market</p>
              <p className="text-[10px] text-slate-400">Interactive Dashboard & Forecasting</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="rounded border border-border/70 px-2 py-1 text-[9px] text-slate-400">{providerStatus.label}</span>
            <button className="h-6 w-6 rounded border border-border/70 text-[10px] text-slate-400">i</button>
            <button className="h-6 w-6 rounded border border-border/70 text-[10px] text-slate-400" onClick={() => setIsDarkMode((prev) => !prev)}>{isDarkMode ? '☀' : '☾'}</button>
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
            <div className="flex items-center gap-2 rounded border border-border/70 bg-[#0f1626] px-2 py-1 text-[10px] text-slate-400">
              Compare Models
              <Switch checked={compareModels} onCheckedChange={setCompareModels} />
            </div>
          </div>
        </section>

        <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
          {kpiCards.map((card, index) => (
            <Card key={card.label} className="border-border/70 bg-[#121a2b]">
              <CardContent className="p-2.5">
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-[10px] text-slate-400">{card.label}</p>
                  <span className="text-[8px] text-slate-500">{card.icon}</span>
                </div>
                <p className="font-mono text-[18px] leading-none text-slate-100">{card.label === '30Y Mortgage' ? `${card.value.toFixed(2)}%` : card.value.toFixed(1)}</p>
                <div className="mt-2 flex justify-between text-[10px]">
                  <span className="text-emerald-300">YoY {fmtPct(card.yoy)}</span>
                  <span className={index % 2 === 0 ? 'text-slate-400' : 'text-amber-300'}>MoM {fmtPct(card.mom)}</span>
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
                  <CardTitle className="text-[12px]">Building Permits by State</CardTitle>
                  <p className="text-[10px] text-slate-400">Permits and employment view with state drill-in.</p>
                </div>
                <div className="inline-flex rounded border border-border/70 bg-[#0f1626] p-0.5 text-[9px]">
                  <button className={`rounded px-2 py-0.5 ${mapMetric === 'permits' ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400'}`} onClick={() => setMapMetric('permits')}>Permits</button>
                  <button className={`rounded px-2 py-0.5 ${mapMetric === 'employment' ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400'}`} onClick={() => setMapMetric('employment')}>Employment</button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="h-[304px] p-3">
              <div className="relative h-full rounded border border-border/70 bg-[#0e1628] p-2.5">
                <svg viewBox="0 0 430 260" className="h-full w-full">
                  <path
                    d="M 52 52 L 138 48 L 198 72 L 254 74 L 326 70 L 364 86 L 376 120 L 370 176 L 336 220 L 252 226 L 192 210 L 126 202 L 84 168 L 68 122 Z"
                    fill="rgba(148,163,184,0.08)"
                    stroke="rgba(148,163,184,0.22)"
                    strokeWidth="1"
                  />
                  {mapEntries.map((item) => {
                    const polygon = usStatePolygons.find((entry) => entry.id === item.stateId)
                    if (!polygon) return null
                    const ratio = (item.value - mapExtent.min) / Math.max(mapExtent.max - mapExtent.min, 1)
                    const fill = `rgba(245, 158, ${Math.max(26, Math.round(80 - ratio * 54))}, ${0.24 + ratio * 0.62})`

                    return (
                      <g key={item.stateId}>
                        <path
                          d={polygon.d}
                          fill={fill}
                          stroke="rgba(245,158,11,0.62)"
                          strokeWidth="1"
                          className="cursor-pointer"
                          onMouseEnter={() => setHoverMap({ state: item.stateName, value: item.value })}
                          onMouseLeave={() => setHoverMap(null)}
                          onClick={() => {
                            setGeographyLevel('state')
                            const region = metadata?.geography.states.find((entry) => entry.id === item.stateId)?.regionId
                            if (region) setRegionId(region)
                            setStateId(item.stateId)
                          }}
                        />
                        <text x={polygon.labelX} y={polygon.labelY} textAnchor="middle" fontSize="10" fill="rgba(241,245,249,0.9)">
                          {item.stateId}
                        </text>
                      </g>
                    )
                  })}
                </svg>

                {hoverMap && (
                  <div className="absolute left-2.5 top-2.5 rounded border border-border/70 bg-[#070c18]/95 px-2 py-1 text-[10px]">
                    <p className="font-medium text-slate-100">{hoverMap.state}</p>
                    <p className="font-mono text-slate-400">{hoverMap.value.toFixed(1)} index</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-[#121a2b]">
            <CardHeader className="border-b border-border/60 pb-2">
              <div className="flex items-start justify-between gap-2">
                <div className="leading-tight">
                  <CardTitle className="text-[12px]">{indicators.find((entry) => entry.id === indicatorId)?.name ?? indicatorId}</CardTitle>
                  <p className="text-[10px] text-slate-400">Historical (white) with forecast projection (orange).</p>
                </div>
                <span className="rounded border border-amber-300/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] uppercase text-amber-300">Model: {forecastOutput.bestModel}</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 p-3">
              <div className="relative h-[222px] rounded border border-border/70 bg-[#0e1628] p-2">
                {loading ? (
                  <div className="grid h-full place-items-center text-[11px] text-slate-400">Loading series…</div>
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
                <div>{compareModels ? `${forecastOutput.comparison.length} models` : 'Best model only'}</div>
              </div>

              <div className="rounded border border-border/70 bg-[#0f1626] px-2 py-1.5">
                <div className="mb-1 flex items-center justify-between text-[10px] text-slate-400">
                  <span>Range Brush</span>
                  <span className="font-mono">{brushedSeries[0]?.date ?? '—'} → {brushedSeries.at(-1)?.date ?? '—'}</span>
                </div>
                <div className="grid gap-1">
                  <input type="range" min={0} max={95} value={brushStart} onChange={(event) => setBrushStart(Math.min(Number(event.target.value), brushEnd - 5))} />
                  <input type="range" min={5} max={100} value={brushEnd} onChange={(event) => setBrushEnd(Math.max(Number(event.target.value), brushStart + 5))} />
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="inline-flex rounded border border-border/70 bg-[#121a2b] p-0.5">
          {(['all', '10y', '5y', '3y', '1y'] as RangeOption[]).map((option) => (
            <button
              key={option}
              className={`rounded px-2.5 py-1 text-[10px] uppercase ${range === option ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:text-slate-200'}`}
              onClick={() => setRange(option)}
            >
              {option}
            </button>
          ))}
        </section>

        <Card className="border-border/70 bg-[#121a2b]">
          <CardHeader className="pb-1.5">
            <CardTitle className="text-[12px]">Methodology & Sources</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-[10.5px] leading-relaxed text-slate-400 md:grid-cols-2">
            <div className="space-y-1 rounded border border-border/65 bg-[#0f1626] p-2">
              <p className="text-[10px] uppercase tracking-[0.08em] text-slate-200">Data Sources</p>
              <p>Core indicators are served through the repository provider contract, using local synthetic data when live env credentials are unavailable.</p>
              <p>Current panels are wired to permits, starts, employment, and input cost index series from the checked-in dataset.</p>
            </div>
            <div className="space-y-1 rounded border border-border/65 bg-[#0f1626] p-2">
              <p className="text-[10px] uppercase tracking-[0.08em] text-slate-200">Forecasting</p>
              <p>The existing forecast engine compares naive, SES, Holt, and lag-regression models, selecting by validation RMSE.</p>
              <p>Confidence bands are derived from model residual volatility and data history length.</p>
            </div>
            <div className="space-y-1 rounded border border-border/65 bg-[#0f1626] p-2 md:col-span-2">
              <p className="text-[10px] uppercase tracking-[0.08em] text-slate-200">Limitations</p>
              <p>30Y Mortgage and ABI are proxy calculations from available indicators to keep the dashboard wired to the current contract without introducing unsupported data feeds.</p>
              {forecastOutput.warnings.length > 0 && <p className="text-amber-200">Forecast warning: {forecastOutput.warnings.join(' ')}</p>}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

export default App
