import { useEffect, useMemo, useState } from 'react'

import { ChartCard } from '@/components/dashboard/ChartCard'
import { ControlsRow } from '@/components/dashboard/ControlsRow'
import { Footer } from '@/components/dashboard/Footer'
import { HeaderBar } from '@/components/dashboard/HeaderBar'
import { InsightsPanel } from '@/components/dashboard/InsightsPanel'
import { KpiGrid } from '@/components/dashboard/KpiGrid'
import { MapCard } from '@/components/dashboard/MapCard'
import { MethodologyCard } from '@/components/dashboard/MethodologyCard'
import { ModelComparisonPanel } from '@/components/dashboard/ModelComparisonPanel'
import { buildKpis, mapDataByIndicator, toSeries } from '@/components/dashboard/dataTransforms'
import type { DashboardOption, KpiMetric } from '@/components/dashboard/types'
import type { DashboardData, GeographyLevel } from '@/data/types'
import type { ForecastOutput } from '@/forecasting'
import { buildInsights } from '@/insights'
import { createDataProvider } from '@/providers/providerFactory'

const providerBundle = createDataProvider()
const provider = providerBundle.provider

const geographyLevels: DashboardOption[] = [
  { label: 'United States', value: 'us' },
  { label: 'Region', value: 'region' },
  { label: 'State', value: 'state' },
  { label: 'Metro', value: 'metro' }
]

const formatPct = (value: number | null) => (value == null ? 'N/A' : `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`)

const emptyForecastOutput: ForecastOutput = {
  horizon: 12,
  bestModel: 'naive',
  forecast: [],
  comparison: [],
  validationWindow: 0,
  warnings: []
}

function App() {
  const [isDarkMode, setIsDarkMode] = useState(true)
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [providerStatus, setProviderStatus] = useState(providerBundle.runtime.getStatus())

  const [geographyLevel, setGeographyLevel] = useState<GeographyLevel>('us')
  const [regionId, setRegionId] = useState('northeast')
  const [stateId, setStateId] = useState('CA')
  const [metroId, setMetroId] = useState('los-angeles-ca')
  const [indicatorGroup, setIndicatorGroup] = useState('Market Activity')
  const [indicatorId, setIndicatorId] = useState('permits')
  const [forecastEnabled, setForecastEnabled] = useState(true)
  const [forecastHorizon, setForecastHorizon] = useState<'3' | '6' | '12'>('12')
  const [compareModels, setCompareModels] = useState(false)
  const [range, setRange] = useState<'all' | '10y' | '5y' | '3y' | '1y'>('5y')

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

  const regionOptions = useMemo(
    () => metadata?.geography.regions.map((region) => ({ label: region.name, value: region.id })) ?? [],
    [metadata]
  )

  const stateOptions = useMemo(() => {
    const source = metadata?.geography.states ?? []
    return source
      .filter((state) => (geographyLevel === 'state' || geographyLevel === 'metro' || geographyLevel === 'region' ? state.regionId === regionId : true))
      .map((state) => ({ label: state.name, value: state.id }))
  }, [geographyLevel, metadata, regionId])

  const metroOptions = useMemo(() => {
    const source = metadata?.geography.metros ?? []
    return source.filter((metro) => metro.stateId === stateId).map((metro) => ({ label: metro.name, value: metro.id }))
  }, [metadata, stateId])

  useEffect(() => {
    if (stateOptions.length && !stateOptions.some((option) => option.value === stateId)) {
      setStateId(stateOptions[0].value)
    }
  }, [stateId, stateOptions])

  useEffect(() => {
    if (metroOptions.length && !metroOptions.some((option) => option.value === metroId)) {
      setMetroId(metroOptions[0].value)
    }
  }, [metroId, metroOptions])

  const indicatorGroupOptions = useMemo(() => {
    const groups = new Set((metadata?.indicators ?? []).filter((indicator) => indicator.geographyLevels.includes('us')).map((indicator) => indicator.group))
    return [...groups].map((group) => ({ label: group, value: group }))
  }, [metadata])

  const availableIndicators = useMemo(() => {
    const indicators = metadata?.indicators ?? []
    return indicators.filter((indicator) => {
      const levelMatch = indicator.geographyLevels.includes(geographyLevel)
      if (!levelMatch) return false
      return geographyLevel === 'us' ? indicator.group === indicatorGroup : true
    })
  }, [geographyLevel, indicatorGroup, metadata])

  useEffect(() => {
    if (availableIndicators.length && !availableIndicators.some((indicator) => indicator.id === indicatorId)) {
      setIndicatorId(availableIndicators[0].id)
    }
  }, [availableIndicators, indicatorId])

  const selectedGeographyId = geographyLevel === 'us' ? 'us' : geographyLevel === 'region' ? regionId : geographyLevel === 'state' ? stateId : metroId

  const primarySeries = useMemo(
    () => toSeries(observations, geographyLevel, selectedGeographyId, indicatorId),
    [geographyLevel, indicatorId, observations, selectedGeographyId]
  )

  const secondaryIndicator = availableIndicators.find((indicator) => indicator.id !== indicatorId)?.id ?? indicatorId
  const secondarySeries = useMemo(
    () => toSeries(observations, geographyLevel, selectedGeographyId, secondaryIndicator),
    [geographyLevel, observations, secondaryIndicator, selectedGeographyId]
  )

  const [forecastOutput, setForecastOutput] = useState<ForecastOutput>(emptyForecastOutput)

  useEffect(() => {
    const loadForecast = async () => {
      if (!forecastEnabled) {
        setForecastOutput({ ...emptyForecastOutput, horizon: Number(forecastHorizon) as 3 | 6 | 12 })
        return
      }

      const response = await provider.getForecast({
        geographyLevel,
        geographyId: selectedGeographyId,
        indicatorId,
        periods: Number(forecastHorizon) as 3 | 6 | 12
      })
      setForecastOutput(response.output)
      setProviderStatus(providerBundle.runtime.getStatus())
    }

    void loadForecast()
  }, [forecastEnabled, forecastHorizon, geographyLevel, indicatorId, selectedGeographyId])

  const kpis = useMemo<KpiMetric[]>(() => {
    const values = buildKpis({
      selectedIndicator: indicatorId,
      indicators: metadata?.indicators ?? [],
      series: primarySeries,
      comparisonSeries: secondarySeries
    })

    return values.map((value) => {
      const delta = value.momChange
      return {
        ...value,
        trend: delta == null ? 'flat' : delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
        deltaText: `MoM ${formatPct(value.momChange)}`,
        yoyText: `YoY ${formatPct(value.yoyChange)}`
      }
    })
  }, [indicatorId, metadata?.indicators, primarySeries, secondarySeries])

  const mapEntries = useMemo(() => mapDataByIndicator(dashboardData?.mapData ?? [], indicatorId === 'employment' ? 'employment' : 'permits'), [dashboardData?.mapData, indicatorId])

  const isEmpty = !primarySeries.points.length

  const selectedIndicatorMeta = availableIndicators.find((indicator) => indicator.id === indicatorId)
  const selectedLabel =
    geographyLevel === 'us'
      ? 'United States'
      : geographyLevel === 'region'
        ? regionOptions.find((option) => option.value === regionId)?.label ?? regionId
        : geographyLevel === 'state'
          ? stateOptions.find((option) => option.value === stateId)?.label ?? stateId
          : metroOptions.find((option) => option.value === metroId)?.label ?? metroId

  const nationalSeries = useMemo(
    () => toSeries(observations, 'us', 'us', indicatorId),
    [indicatorId, observations]
  )

  const insights = useMemo(
    () =>
      buildInsights({
        indicatorId,
        indicatorName: selectedIndicatorMeta?.name ?? indicatorId,
        geographyLevel,
        geographyLabel: selectedLabel,
        series: primarySeries.points,
        comparison: {
          label: availableIndicators.find((indicator) => indicator.id === secondaryIndicator)?.name ?? 'Companion KPI',
          indicatorId: secondaryIndicator,
          series: secondarySeries.points
        },
        nationalBenchmark:
          geographyLevel === 'us'
            ? undefined
            : {
                label: 'United States',
                series: nationalSeries.points
              },
        forecastEnabled,
        forecast: forecastOutput
      }),
    [
      availableIndicators,
      forecastEnabled,
      forecastOutput,
      geographyLevel,
      indicatorId,
      nationalSeries.points,
      primarySeries.points,
      secondaryIndicator,
      secondarySeries.points,
      selectedIndicatorMeta?.name,
      selectedLabel
    ]
  )

  return (
    <div className="min-h-screen bg-background text-foreground">
      <HeaderBar isDarkMode={isDarkMode} onToggleTheme={() => setIsDarkMode((prev) => !prev)} modeLabel={providerStatus.label} />
      <main className="mx-auto flex w-full max-w-[1360px] flex-col gap-2 px-3 py-2.5 md:gap-2.5 md:px-4 md:py-3">
        {providerStatus.message && (
          <p className="rounded-md border border-border/75 bg-card/45 px-3 py-2 text-[11px] text-muted-foreground">{providerStatus.message}</p>
        )}
        <ControlsRow
          geographyLevels={geographyLevels}
          selectedGeographyLevel={geographyLevel}
          onGeographyLevelChange={(value) => setGeographyLevel(value as GeographyLevel)}
          regions={regionOptions}
          selectedRegion={regionId}
          onRegionChange={setRegionId}
          states={stateOptions}
          selectedState={stateId}
          onStateChange={setStateId}
          metros={metroOptions}
          selectedMetro={metroId}
          onMetroChange={setMetroId}
          indicatorGroups={indicatorGroupOptions}
          selectedIndicatorGroup={indicatorGroup}
          onIndicatorGroupChange={setIndicatorGroup}
          indicators={availableIndicators.map((item) => ({ label: item.name, value: item.id }))}
          selectedIndicator={indicatorId}
          onIndicatorChange={setIndicatorId}
          forecastEnabled={forecastEnabled}
          onForecastToggle={setForecastEnabled}
          forecastHorizon={forecastHorizon}
          onForecastHorizonChange={setForecastHorizon}
          compareModels={compareModels}
          onCompareModelsToggle={setCompareModels}
        />

        <KpiGrid metrics={kpis} />

        <section className="grid gap-2 xl:grid-cols-[1.24fr_0.76fr]">
          <MapCard
            mapData={mapEntries}
            selectedIndicator={indicatorId === 'employment' ? 'employment' : 'permits'}
            onIndicatorToggle={setIndicatorId}
            onDrillState={(nextStateId) => {
              setGeographyLevel('state')
              const regionForState = metadata?.geography.states.find((entry) => entry.id === nextStateId)?.regionId
              if (regionForState) setRegionId(regionForState)
              setStateId(nextStateId)
            }}
          />
          <ChartCard
            historical={primarySeries.points}
            forecast={forecastEnabled ? forecastOutput.forecast : []}
            modelComparison={forecastEnabled ? forecastOutput.comparison : []}
            bestModel={forecastEnabled ? forecastOutput.bestModel : null}
            compareMode={forecastEnabled && compareModels}
            validationWindow={forecastOutput.validationWindow}
            warnings={forecastOutput.warnings}
            range={range}
            onRangeChange={setRange}
            loading={loading}
            empty={isEmpty}
          />
        </section>

        {forecastEnabled && compareModels && <ModelComparisonPanel models={forecastOutput.comparison} bestModel={forecastOutput.bestModel} />}

        <InsightsPanel insights={insights} />

        <MethodologyCard />
      </main>
      <Footer />
    </div>
  )
}

export default App
