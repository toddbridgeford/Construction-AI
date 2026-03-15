import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useEffect } from 'react'
import { useDashboardUrlState } from '@/hooks/useDashboardUrlState'
import {
  buildLeadingKpis,
  useActivity,
  useConsistency,
  useCosts,
  useEquities,
  useForecasts,
  useLabor,
  useMetadata,
  usePipeline
} from '@/hooks/dashboardHooks'
import { MapCard } from '@/components/dashboard/MapCard'

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
  const pipeline = usePipeline(params)
  const costs = useCosts(params)
  const labor = useLabor(params)
  const forecasts = useForecasts(params)
  const consistency = useConsistency(params)
  const equities = useEquities(params)
  const leadingKpis = buildLeadingKpis({ activity, pipeline, labor, costs })

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
            {leadingKpis.map((card) => (
              <Card key={card.id}>
                <CardHeader><CardTitle className="text-sm">{card.label}</CardTitle></CardHeader>
                <CardContent className="text-xs">
                  <p>Status: {card.sourceStatus}</p>
                  <p>Freshness: {freshnessLabel(card.freshness)}</p>
                  <p>Latest: {card.latestValue?.toFixed(2) ?? 'N/A'}</p>
                </CardContent>
              </Card>
            ))}
          </section>
        )}

        {state.tab === 'predictive' && (
          <section className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-sm">Forecast quantiles ({state.horizon} months)</CardTitle></CardHeader>
              <CardContent className="text-xs space-y-1">
                {forecasts.data?.bands.slice(0, 4).map((band) => <p key={band.month}>M{band.month}: p10 {band.p10.toFixed(1)} · p50 {band.p50.toFixed(1)} · p90 {band.p90.toFixed(1)}</p>)}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Consistency summary</CardTitle></CardHeader>
              <CardContent className="text-xs space-y-1">
                <p>Forecast source: {forecasts.data?.sourceStatus ?? 'pending'} ({freshnessLabel(forecasts.freshness)})</p>
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
              <p>Visual components consume typed hooks only; HTTP and adapters are isolated in API client/provider layers.</p>
              <p>Pending sources are explicitly labeled `pending`; fallback values are labeled `fallback`; live responses remain `live`.</p>
              <p>Bootstrap endpoints use stale-while-revalidate over IndexedDB cache and expose offline snapshot state.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  )
}

export default App
