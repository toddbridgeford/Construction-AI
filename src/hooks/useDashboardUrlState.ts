import { useEffect, useState } from 'react'

export type TabId = 'overview' | 'leading' | 'predictive' | 'equities' | 'methodology'

export type DashboardUrlState = {
  tab: TabId
  region: string
  metric: string
  horizon: 12
}

const parseState = (): DashboardUrlState => {
  const search = new URLSearchParams(window.location.search)
  const tab = search.get('tab') as TabId | null
  return {
    tab: tab && ['overview', 'leading', 'predictive', 'equities', 'methodology'].includes(tab) ? tab : 'overview',
    region: search.get('region') ?? 'us',
    metric: search.get('metric') ?? 'permits',
    horizon: 12
  }
}

export function useDashboardUrlState() {
  const [state, setLocalState] = useState<DashboardUrlState>(() => parseState())

  useEffect(() => {
    const update = () => setLocalState(parseState())
    window.addEventListener('popstate', update)
    return () => window.removeEventListener('popstate', update)
  }, [])

  const setState = (patch: Partial<DashboardUrlState>) => {
    const next = { ...state, ...patch }
    const search = new URLSearchParams(window.location.search)
    search.set('tab', next.tab)
    search.set('region', next.region)
    search.set('metric', next.metric)
    search.set('horizon', String(next.horizon))
    window.history.replaceState({}, '', `${window.location.pathname}?${search.toString()}`)
    setLocalState(next)
  }

  return { state, setState }
}
