import { useEffect, useState } from 'react'
import type { DashboardTab, SectorId } from '@/api/contracts'

export type TabId = DashboardTab

export type DashboardUrlState = {
  tab: TabId
  region: string
  sector: SectorId
  horizon: 3 | 6 | 12
}

const tabs: DashboardTab[] = ['overview', 'leading', 'predictive', 'equities', 'methodology']
const sectors: SectorId[] = ['permits', 'starts', 'cost_index', 'employment']

const parseState = (): DashboardUrlState => {
  const search = new URLSearchParams(window.location.search)
  const tab = search.get('tab') as TabId | null
  const sector = search.get('sector') as SectorId | null
  const horizon = Number(search.get('horizon')) as 3 | 6 | 12

  return {
    tab: tab && tabs.includes(tab) ? tab : 'overview',
    region: search.get('region') ?? 'us',
    sector: sector && sectors.includes(sector) ? sector : 'permits',
    horizon: [3, 6, 12].includes(horizon) ? horizon : 12
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
    search.set('sector', next.sector)
    search.set('horizon', String(next.horizon))
    window.history.replaceState({}, '', `${window.location.pathname}?${search.toString()}`)
    setLocalState(next)
  }

  return { state, setState }
}
