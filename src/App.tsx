import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useEffect } from 'react'
import { useDashboardUrlState } from '@/hooks/useDashboardUrlState'
import { useEquities, useForecast, useIndicators, useMethodology, useOverview } from '@/hooks/dashboardHooks'

const tabs: Array<{ id: 'overview' | 'leading' | 'predictive' | 'equities' | 'methodology'; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'leading', label: 'Leading Indicators' },
  { id: 'predictive', label: 'Predictive Model' },
  { id: 'equities', label: 'Equities' },
  { id: 'methodology', label: 'Methodology' }
]

function App() {
  const { state, setState } = useDashboardUrlState()
  const params = { geographyLevel: state.region === 'us' ? 'us' as const : 'region' as const, geographyId: state.region, indicatorId: state.metric, horizon: 12 as const }

  const overview = useOverview(params)
  const indicators = useIndicators(params)
  const forecast = useForecast(params)
  const equities = useEquities(params)
  const methodology = useMethodology()

  useEffect(() => {
    document.documentElement.classList.add('dark')
  }, [])

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-5 text-slate-100">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
          <h1 className="text-lg font-semibold">Construction AI Dashboard</h1>
          <p className="text-xs text-slate-300">FastAPI-oriented typed contracts with offline snapshot fallback.</p>
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
              <CardHeader><CardTitle className="text-sm">Data readiness</CardTitle></CardHeader>
              <CardContent className="text-xs">
                {overview.loading && <p>Loading…</p>}
                {overview.error && <p className="text-rose-300">{overview.error}</p>}
                {overview.data && Object.entries(overview.data.readiness).map(([metric, status]) => (
                  <p key={metric}>{metric}: <span className="font-semibold">{status}</span></p>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Filters (URL-driven)</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-xs">
                <label className="block">Region
                  <input className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-1" value={state.region} onChange={(e) => setState({ region: e.target.value })} />
                </label>
                <label className="block">Metric
                  <input className="mt-1 w-full rounded border border-slate-700 bg-slate-900 p-1" value={state.metric} onChange={(e) => setState({ metric: e.target.value })} />
                </label>
              </CardContent>
            </Card>
          </section>
        )}

        {state.tab === 'leading' && (
          <section className="grid gap-4 md:grid-cols-2">
            {indicators.data?.metrics.map((metric) => (
              <Card key={metric.id}>
                <CardHeader><CardTitle className="text-sm">{metric.label}</CardTitle></CardHeader>
                <CardContent className="text-xs">
                  <p>{metric.role} · source {metric.sourceStatus}</p>
                  <p>Latest: {metric.series.at(-1)?.value?.toFixed(2) ?? 'N/A'}</p>
                </CardContent>
              </Card>
            ))}
          </section>
        )}

        {state.tab === 'predictive' && (
          <section className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-sm">Forecast quantiles (12 months)</CardTitle></CardHeader>
              <CardContent className="text-xs space-y-1">
                {forecast.data?.bands.slice(0, 4).map((b) => <p key={b.month}>M{b.month}: p10 {b.p10.toFixed(1)} · p50 {b.p50.toFixed(1)} · p90 {b.p90.toFixed(1)}</p>)}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Terminal scenarios</CardTitle></CardHeader>
              <CardContent className="text-xs">
                <p>Cycle phase: {forecast.data?.cyclePhase ?? 'N/A'}</p>
                <p>Bear: {forecast.data?.terminal.bear.toFixed(1) ?? 'N/A'}</p>
                <p>Base: {forecast.data?.terminal.base.toFixed(1) ?? 'N/A'}</p>
                <p>Bull: {forecast.data?.terminal.bull.toFixed(1) ?? 'N/A'}</p>
              </CardContent>
            </Card>
          </section>
        )}

        {state.tab === 'equities' && (
          <Card>
            <CardHeader><CardTitle className="text-sm">Equities feed status</CardTitle></CardHeader>
            <CardContent className="text-xs space-y-1">
              {equities.data?.rows.map((row) => <p key={row.symbol}>{row.symbol}: {row.price} ({row.sourceStatus})</p>)}
            </CardContent>
          </Card>
        )}

        {state.tab === 'methodology' && (
          <Card>
            <CardHeader><CardTitle className="text-sm">Methodology</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-xs">
              {methodology.data?.sections.map((section) => (
                <div key={section.title}>
                  <p className="font-semibold">{section.title}</p>
                  <p className="text-slate-300">{section.body}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  )
}

export default App
