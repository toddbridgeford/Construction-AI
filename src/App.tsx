import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useEffect } from 'react'
import { useDashboardUrlState } from '@/hooks/useDashboardUrlState'
import {
  buildCoreMetricCards,
  useActivity,
  useConsistency,
  useCosts,
  useEquities,
  useLabor,
  useMetadata,
  usePipeline
} from '@/hooks/dashboardHooks'
import { MapCard } from '@/components/dashboard/MapCard'
import { computeCompositeMethodology } from '@/lib/compositeMethodology'

const tabs: Array<{ id: 'overview' | 'leading' | 'predictive' | 'equities' | 'methodology'; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'leading', label: 'Leading Indicators' },
  { id: 'predictive', label: 'Predictive Model' },
  { id: 'equities', label: 'Equities' },
  { id: 'methodology', label: 'Methodology' }
]

function App() {
  const { state, setState } = useDashboardUrlState()
  const params = {
    geographyLevel: state.region === 'us' ? ('us' as const) : ('region' as const),
    geographyId: state.region,
    region: state.region,
    sector: state.sector,
    horizon: state.horizon,
    tab: state.tab
  }

  const metadata = useMetadata()
  const activity = useActivity(params)
  const activityStarts = useActivity({ ...params, sector: 'starts' })
  usePipeline(params)
  const costs = useCosts(params)
  useLabor(params)
  const consistency = useConsistency(params)
  const equities = useEquities(params)
  const coreMetrics = buildCoreMetricCards({ activity, activityStarts, costs, equities })
  const compositeMethodology = computeCompositeMethodology({
    metrics: coreMetrics.map((metric) => {
      const history =
        metric.id === 'building_permits'
          ? activity.data?.series
          : metric.id === 'housing_starts'
            ? activityStarts.data?.series
            : metric.id === 'materials_ppi'
              ? costs.data?.series
              : undefined

      return {
        id: metric.id,
        label: metric.label,
        sourceStatus: metric.sourceStatus,
        safeForComposite: metric.safeForComposite,
        growthMom: metric.growthMom,
        growthYoy: metric.growthYoy,
        latestValue: metric.latestValue,
        modelExclusionReason: metric.modelExclusionReason,
        history
      }
    }),
    horizon: state.horizon
  })

  useEffect(() => {
    document.documentElement.classList.add('dark')
  }, [])

  const freshnessLabel = (value?: { source: string; offlineSnapshot: boolean; isStale: boolean } | null) => {
    if (!value) return 'no-cache'
    return `${value.source}${value.offlineSnapshot ? ' · offline snapshot' : ''}${value.isStale ? ' · stale' : ''}`
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-5 text-slate-100">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
          <h1 className="text-lg font-semibold">Construction AI Dashboard</h1>
          <p className="text-xs text-slate-300">Typed API hooks + IndexedDB offline snapshots + stale-while-revalidate bootstrap.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {tabs.map((tab) => (
              <button key={tab.id} className={`rounded border px-2 py-1 text-xs ${state.tab === tab.id ? 'border-blue-300 bg-blue-400/15 text-blue-100' : 'border-slate-700 text-slate-300'}`} onClick={() => setState({ tab: tab.id })}>
                {tab.label}
              </button>
            ))}
          </div>
        </header>

        {state.tab === 'overview' && (
          <section className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-sm">Metadata + contract readiness</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-xs">
                <p>Freshness: {freshnessLabel(metadata.freshness)}</p>
                {metadata.data?.filterOptions.sectors.map((sector) => <p key={sector.sectorId}>{sector.label}: <span className="font-semibold">{sector.readiness}</span></p>)}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Filters (URL-driven)</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-xs">
                <label className="block">Region
                  <input className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-1" value={state.region} onChange={(e) => setState({ region: e.target.value })} />
                </label>
                <label className="block">Sector
                  <select className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-1" value={state.sector} onChange={(e) => setState({ sector: e.target.value as typeof state.sector })}>
                    <option value="permits">Activity</option>
                    <option value="starts">Pipeline</option>
                    <option value="cost_index">Costs</option>
                    <option value="employment">Labor</option>
                  </select>
                </label>
                <label className="block">Horizon
                  <select className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-1" value={state.horizon} onChange={(e) => setState({ horizon: Number(e.target.value) as 3 | 6 | 12 })}>
                    <option value={3}>3</option>
                    <option value={6}>6</option>
                    <option value={12}>12</option>
                  </select>
                </label>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Composite Index (0-100)</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-xs">
                <p>Score: <span className="font-semibold">{compositeMethodology.scoreLabel}</span></p>
                <p>Status: {compositeMethodology.status}</p>
                <p>{compositeMethodology.message}</p>
                <p>Valid metrics: {compositeMethodology.validMetricCount}/{compositeMethodology.minimumRequiredMetrics} minimum</p>
                <p>Recent history: {compositeMethodology.history.slice(-3).map((point) => `${point.date}: ${point.score.toFixed(1)}`).join(' · ') || 'N/A'}</p>
              </CardContent>
            </Card>
            <div className="grid gap-4 md:col-span-2 md:grid-cols-2 lg:grid-cols-3">
              {coreMetrics.map((metric) => (
                <Card key={metric.id}>
                  <CardHeader><CardTitle className="text-sm">{metric.label}</CardTitle></CardHeader>
                  <CardContent className="text-xs space-y-1">
                    <p>Latest: {metric.formattedValue}</p>
                  <p>Signal: {metric.signal}</p>
                  <p>Status: {metric.sourceStatus}</p>
                  <p>Readiness: {metric.readinessClassification}</p>
                  <p>Source: {metric.upstreamSource}</p>
                </CardContent>
              </Card>
              ))}
            </div>
            <div className="md:col-span-2">
              {activity.data && (
                <MapCard
                  mapData={activity.data.mapData}
                  selectedIndicator={state.sector}
                  onIndicatorToggle={(value) => setState({ sector: value as typeof state.sector })}
                  onDrillState={(stateId) => setState({ region: stateId })}
                />
              )}
            </div>
          </section>
        )}

        {state.tab === 'leading' && (
          <section className="grid gap-4 md:grid-cols-3">
            {coreMetrics.map((metric) => (
              <Card key={metric.id}>
                <CardHeader><CardTitle className="text-sm">{metric.label}</CardTitle></CardHeader>
                <CardContent className="text-xs space-y-1">
                  <p>Status: {metric.sourceStatus}</p>
                  <p>Readiness: {metric.readinessClassification}</p>
                  <p>Freshness: {freshnessLabel(metric.freshness)}</p>
                  <p>Latest: {metric.formattedValue}</p>
                  <p>{metric.transformSummary}</p>
                  <p>Hook: {metric.hookPath}</p>
                </CardContent>
              </Card>
            ))}
          </section>
        )}

        {state.tab === 'predictive' && (
          <section className="grid gap-4 md:grid-cols-2"> 
            <Card>
              <CardHeader><CardTitle className="text-sm">Composite forecast quantiles ({state.horizon} months)</CardTitle></CardHeader>
              <CardContent className="text-xs space-y-1">
                {compositeMethodology.predictiveModel?.forecast.slice(0, 4).map((point, index) => {
                  const spread = Math.max((point.upperBound - point.lowerBound) / 2, 0.5)
                  const p10 = point.value - spread
                  const p50 = point.value
                  const p90 = point.value + spread
                  return <p key={point.date}>M{index + 1}: p10 {p10.toFixed(1)} · p50 {p50.toFixed(1)} · p90 {p90.toFixed(1)}</p>
                })}
                {!compositeMethodology.predictiveModel && <p>{compositeMethodology.historyMessage}</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Composite model inputs (validated only)</CardTitle></CardHeader>
              <CardContent className="text-xs space-y-1">
                <p>Predictive source: shared composite methodology (equal-weighted)</p>
                <p>Included inputs: {compositeMethodology.audit.filter((item) => item.status === 'included').map((item) => item.label).join(', ') || 'None'}</p>
                {compositeMethodology.audit.filter((item) => item.status === 'excluded').map((item) => (
                  <p key={item.id}>Excluded {item.label}: {item.reason}</p>
                ))}
                {consistency.data?.checks.map((check) => <p key={check.id}>{check.ok ? '✓' : '•'} {check.message}</p>)}
              </CardContent>
            </Card>
          </section>
        )}

        {state.tab === 'equities' && (
          <Card>
            <CardHeader><CardTitle className="text-sm">Equities snapshot</CardTitle></CardHeader>
            <CardContent className="text-xs space-y-1">
              <p>Freshness: {freshnessLabel(equities.freshness)}</p>
              {equities.data?.rows.map((row) => <p key={row.symbol}>{row.symbol}: {row.price} ({row.sourceStatus})</p>)}
            </CardContent>
          </Card>
        )}

        {state.tab === 'methodology' && (
          <Card>
            <CardHeader><CardTitle className="text-sm">Methodology</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-xs">
              <p>Each KPI card is mapped to a specific upstream feed, typed hook path, and API endpoint contract; pending feeds remain explicitly marked pending.</p>
              <p>Composite methodology is explicit and equal-weighted: each valid metric is normalized from directional growth (YoY preferred, MoM fallback) into a 0-100 score by clamping to ±{compositeMethodology.methodology.clampRangePct}% then scaling linearly.</p>
              <p>Direct metrics use growth as-is, while inverse metrics (Materials PPI) flip growth sign before normalization; pending, explicitly excluded, non-eligible, or missing-growth metrics are excluded with explicit reasons.</p>
              <p>Composite score requires at least {compositeMethodology.methodology.minimumRequiredMetrics} valid metrics and composite history requires at least {compositeMethodology.methodology.minimumRequiredHistoryPoints} valid points; predictive modeling consumes only this shared composite history.</p>
              <p>Bootstrap endpoints use stale-while-revalidate over IndexedDB cache and expose offline snapshot state.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  )
}

export default App
