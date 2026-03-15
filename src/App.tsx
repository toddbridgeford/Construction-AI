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
  useMacro,
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
  const abi = useMacro({ ...params, metric: 'abi' })
  const constructionSpending = useMacro({ ...params, metric: 'construction_spending' })
  const nahbHmi = useMacro({ ...params, metric: 'nahb_hmi' })
  const coreMetrics = buildCoreMetricCards({ activity, activityStarts, costs, equities, abi, constructionSpending, nahbHmi })
  const compositeMethodology = computeCompositeMethodology({
    metrics: coreMetrics.map((metric) => {
      return {
        id: metric.id,
        label: metric.label,
        sourceStatus: metric.sourceStatus,
        safeForComposite: metric.safeForComposite,
        growthMom: metric.growthMom,
        growthYoy: metric.growthYoy,
        latestValue: metric.latestValue,
        baselineGap: metric.baselineGap,
        transformType: metric.transformType,
        transformValid: metric.transformValid,
        transformInvalidReason: metric.transformInvalidReason,
        modelExclusionReason: metric.modelExclusionReason,
        history: metric.history
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

  const statusPresentation = (readiness: string) => {
    if (readiness === 'live-capable') return { label: 'Live', className: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200' }
    if (readiness === 'fallback-capable') return { label: 'Available via fallback', className: 'border-amber-400/40 bg-amber-500/10 text-amber-200' }
    if (readiness === 'excluded-from-composite') return { label: 'Excluded from composite', className: 'border-violet-400/40 bg-violet-500/10 text-violet-200' }
    return { label: 'Onboarding', className: 'border-sky-400/40 bg-sky-500/10 text-sky-200' }
  }

  const integrationPathLabel = (path: string) => {
    if (path.includes('/api/activity-series')) return 'Activity pipeline'
    if (path.includes('/api/macro-series')) return 'Macro pipeline'
    if (path.includes('/api/cost-series')) return 'Cost pipeline'
    if (path.includes('/api/equities-snapshot')) return 'Equities pipeline'
    return 'Core data pipeline'
  }

  const unitLabel = (unit: string) => {
    if (unit === 'annual-rate') return 'annual rate'
    if (unit === 'usd-billion') return 'USD billions'
    return unit
  }

  const registryRows = coreMetrics.map((metric) => {
    const status = statusPresentation(metric.readinessClassification)
    const compositeRole = metric.readinessClassification === 'excluded-from-composite'
      ? 'Excluded from composite'
      : metric.sourceStatus === 'pending' || !metric.safeForComposite
        ? 'Composite-eligible when validated'
        : 'Included when valid'

    return {
      id: metric.id,
      metric: metric.label,
      source: metric.upstreamSource,
      integrationPath: integrationPathLabel(metric.endpointPath),
      integrationDetail: `${metric.endpointPath} · ${metric.hookPath}`,
      unit: unitLabel(metric.unit),
      transform: metric.transformType === 'inverse' ? 'inverse' : metric.transformType === 'diffusion' ? 'diffusion baseline' : 'direct',
      status,
      compositeRole
    }
  })

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
          <section className="space-y-5">
            <Card className="border-slate-800 bg-slate-900/70">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">1. Methodology Overview</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 text-xs leading-relaxed md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-md border border-slate-800 bg-slate-950/60 p-3.5">
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">Composite Index</p>
                  <p className="mt-1 text-slate-200">A single-cycle signal that translates validated macro momentum into an intuitive 0–100 operating score.</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="rounded-full border border-slate-700 px-2 py-0.5">0–100 normalized</span>
                    <span className="rounded-full border border-slate-700 px-2 py-0.5">equal-weighted</span>
                    <span className="rounded-full border border-slate-700 px-2 py-0.5">{compositeMethodology.validMetricCount}/{compositeMethodology.minimumRequiredMetrics}+ valid</span>
                  </div>
                </div>
                <div className="rounded-md border border-slate-800 bg-slate-950/60 p-3.5">
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">Predictive Model</p>
                  <p className="mt-1 text-slate-200">Forward ranges are produced directly from composite history, preserving one consistent narrative from current state to projected outcomes.</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="rounded-full border border-slate-700 px-2 py-0.5">composite-driven input</span>
                    <span className="rounded-full border border-slate-700 px-2 py-0.5">quantile envelope</span>
                    <span className="rounded-full border border-slate-700 px-2 py-0.5">cycle phase labeling</span>
                  </div>
                </div>
                <div className="rounded-md border border-slate-800 bg-slate-950/60 p-3.5">
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">Data Sources</p>
                  <p className="mt-1 text-slate-200">Each metric is governed by a transparent source policy, transformation rule, and composite inclusion standard.</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="rounded-full border border-slate-700 px-2 py-0.5">7-metric registry</span>
                    <span className="rounded-full border border-slate-700 px-2 py-0.5">runtime status badges</span>
                    <span className="rounded-full border border-slate-700 px-2 py-0.5">policy exclusions explicit</span>
                  </div>
                </div>
                <div className="rounded-md border border-slate-800 bg-slate-950/60 p-3.5">
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">PWA / Offline Mode</p>
                  <p className="mt-1 text-slate-200">The installable experience keeps operators productive with instant startup and offline snapshot continuity while data refreshes in the background.</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="rounded-full border border-slate-700 px-2 py-0.5">stale-while-revalidate</span>
                    <span className="rounded-full border border-slate-700 px-2 py-0.5">IndexedDB snapshots</span>
                    <span className="rounded-full border border-slate-700 px-2 py-0.5">freshness labels</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-800 bg-slate-900/70">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">2. Composite Index Construction</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs leading-relaxed">
                <div className="rounded-md border border-slate-800 bg-slate-950/60 p-4">
                  <p className="text-slate-200">Eligible indicators are converted into a comparable <span className="font-semibold text-slate-100">0–100 score range</span>, then combined to form the composite signal.</p>
                  <div className="mt-3 rounded-md border border-slate-700/80 bg-slate-900/80 p-3 text-sm text-slate-100">
                    <p className="font-semibold">Composite score = mean[ map( clamp( directional growth, ±{compositeMethodology.methodology.clampRangePct}% ), 0 → 100 ) ]</p>
                    <p className="mt-1 text-xs text-slate-300">Interpretation: higher readings indicate broader, stronger construction-cycle momentum across validated inputs.</p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] text-slate-200">
                    {[
                      'YoY preferred',
                      'MoM fallback',
                      'Inverse metrics flip direction',
                      'Equal-weight scoring',
                      `Minimum ${compositeMethodology.methodology.minimumRequiredMetrics} valid inputs required`
                    ].map((rule) => (
                      <span key={rule} className="rounded-full border border-slate-700 bg-slate-900/70 px-2 py-0.5">{rule}</span>
                    ))}
                  </div>
                  <p className="mt-3 text-slate-300">Model projections require at least {compositeMethodology.methodology.minimumRequiredHistoryPoints} history points in addition to the current minimum valid input set.</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-800 bg-slate-900/70">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">3. Seven-Metric Registry</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <div className="rounded-md border border-slate-800 bg-slate-950/60 p-2.5 text-[11px] text-slate-300">
                  <p className="font-medium text-slate-200">Registry legend</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {['Included when valid', 'Source onboarding in progress', 'Excluded from composite', 'Fallback-enabled'].map((item) => (
                      <span key={item} className="rounded-full border border-slate-700 px-2 py-0.5">{item}</span>
                    ))}
                  </div>
                </div>
                <div className="overflow-x-auto rounded-md border border-slate-800">
                  <table className="min-w-full divide-y divide-slate-800 text-[11.5px]">
                    <thead className="bg-slate-950/70 text-slate-300">
                      <tr>
                        <th className="px-3 py-2.5 text-left font-medium">Metric</th>
                        <th className="px-3 py-2.5 text-left font-medium">Source</th>
                        <th className="px-3 py-2.5 text-left font-medium">Unit</th>
                        <th className="px-3 py-2.5 text-left font-medium">Transform</th>
                        <th className="px-3 py-2.5 text-left font-medium">Status</th>
                        <th className="px-3 py-2.5 text-left font-medium">Composite role</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 bg-slate-950/35">
                      {registryRows.map((row) => (
                        <tr key={row.metric} className="align-top">
                          <td className="px-3 py-2.5 font-medium text-slate-100">
                            <p>{row.metric}</p>
                            <p className="mt-0.5 text-[10.5px] text-slate-400">{row.integrationPath}</p>
                          </td>
                          <td className="px-3 py-2.5 text-slate-300">{row.source}</td>
                          <td className="px-3 py-2.5 text-slate-300">{row.unit}</td>
                          <td className="px-3 py-2.5 text-slate-300 capitalize">{row.transform}</td>
                          <td className="px-3 py-2.5">
                            <span className={`inline-flex rounded-full border px-2 py-0.5 ${row.status.className}`}>{row.status.label}</span>
                            <p className="mt-1 text-[10px] text-slate-400">{row.integrationDetail}</p>
                          </td>
                          <td className="px-3 py-2.5 text-slate-300">{row.compositeRole}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-800 bg-slate-900/70">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">4. Predictive Model</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs leading-relaxed">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {[
                    { title: 'Model input', body: 'Composite history is the single input stream for all forward scenarios.' },
                    { title: 'Simulation engine', body: '800 simulation paths are generated to stress upside/downside dispersion.' },
                    { title: 'Percentile bands', body: 'Scenario output is summarized as P10 / P25 / P50 / P75 / P90.' },
                    { title: 'Regime switching', body: 'State-aware behavior shifts expected trend dynamics across cycle regimes.' }
                  ].map((item) => (
                    <div key={item.title} className="rounded-md border border-slate-800 bg-slate-950/60 p-3.5">
                      <p className="font-medium text-slate-100">{item.title}</p>
                      <p className="mt-1 text-slate-300">{item.body}</p>
                    </div>
                  ))}
                </div>
                <div className="rounded-md border border-slate-800 bg-slate-950/60 p-3.5">
                  <p className="font-medium text-slate-100">Forecast flow</p>
                  <div className="mt-2 grid gap-2 text-[11px] md:grid-cols-5">
                    {['Composite history', '800 paths', 'Percentile compression', 'Regime selection', 'Cycle clock phase'].map((step, index) => (
                      <div key={step} className="rounded border border-slate-800 bg-slate-900/70 p-2 text-slate-300">
                        <p className="text-slate-500">Step {index + 1}</p>
                        <p className="mt-0.5">{step}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-slate-300">
                    {['Expansion', 'Peak', 'Contraction', 'Trough'].map((phase) => (
                      <span key={phase} className="rounded-full border border-slate-700 px-2 py-0.5">{phase}</span>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-800 bg-slate-900/70">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">5. Data Revision and Fallback Policy</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 text-xs leading-relaxed md:grid-cols-2">
                <div className="rounded-md border border-slate-800 bg-slate-950/60 p-3 text-slate-300">
                  <p className="font-medium text-slate-100">Bootstrap resilience</p>
                  <p className="mt-1">Data bootstraps in stale-while-revalidate mode: cached state renders first, then background refresh updates when network succeeds.</p>
                </div>
                <div className="rounded-md border border-slate-800 bg-slate-950/60 p-3 text-slate-300">
                  <p className="font-medium text-slate-100">Offline snapshot behavior</p>
                  <p className="mt-1">IndexedDB snapshots support continuity when offline. Freshness labels expose cache/network/offline provenance, and an offline snapshot is available when connectivity drops.</p>
                </div>
                <div className="rounded-md border border-slate-800 bg-slate-950/60 p-3 text-slate-300">
                  <p className="font-medium text-slate-100">Status semantics</p>
                  <p className="mt-1">Live and fallback-enabled feeds are separated from onboarding sources; excluded series are explicitly labeled and never represented as live.</p>
                </div>
                <div className="rounded-md border border-slate-800 bg-slate-950/60 p-3 text-slate-300">
                  <p className="font-medium text-slate-100">Revision sensitivity</p>
                  <p className="mt-1">Macro and economic releases can revise after publication; composite history and model bands should be interpreted as revision-sensitive.</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-800 bg-slate-900/70">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">6. PWA Behavior</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2.5 text-xs leading-relaxed md:grid-cols-2 xl:grid-cols-5">
                {[
                  'Installable dashboard experience',
                  'Cached shell for fast startup',
                  'Cached bootstrap data for continuity',
                  'Offline snapshot available when disconnected',
                  'Freshness/state labeling on every feed'
                ].map((item) => (
                  <p key={item} className="rounded-md border border-slate-800 bg-slate-950/60 p-2 text-slate-300">{item}</p>
                ))}
              </CardContent>
            </Card>
          </section>
        )}
      </div>
    </main>
  )
}

export default App
