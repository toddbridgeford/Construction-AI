import { useEffect, useState } from 'react'

import { ChartCard } from '@/components/dashboard/ChartCard'
import { ControlsRow } from '@/components/dashboard/ControlsRow'
import { Footer } from '@/components/dashboard/Footer'
import { HeaderBar } from '@/components/dashboard/HeaderBar'
import { KpiGrid } from '@/components/dashboard/KpiGrid'
import { MapCard } from '@/components/dashboard/MapCard'
import { MethodologyCard } from '@/components/dashboard/MethodologyCard'
import type { DashboardOption, KpiMetric } from '@/components/dashboard/types'

const geographies: DashboardOption[] = [
  { label: 'United States', value: 'us' },
  { label: 'Northeast', value: 'northeast' },
  { label: 'Southeast', value: 'southeast' }
]

const sectors: DashboardOption[] = [
  { label: 'All Segments', value: 'all' },
  { label: 'Residential', value: 'residential' },
  { label: 'Infrastructure', value: 'infrastructure' }
]

const horizons: DashboardOption[] = [
  { label: '12 Months', value: '12m' },
  { label: '24 Months', value: '24m' },
  { label: '36 Months', value: '36m' }
]

const metrics: KpiMetric[] = [
  { label: 'Total Pipeline Value', value: '$482.6B', delta: '+5.3% QoQ', trend: 'up' },
  { label: 'Permits Momentum', value: '112.8', delta: '+1.4 pts', trend: 'up' },
  { label: 'Labor Availability', value: '88.2', delta: '-0.6 pts', trend: 'down' },
  { label: 'Input Cost Pressure', value: '74.1', delta: 'Flat MoM', trend: 'flat' }
]

function App() {
  const [isDarkMode, setIsDarkMode] = useState(true)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode)
  }, [isDarkMode])

  return (
    <div className="min-h-screen bg-background text-foreground">
      <HeaderBar isDarkMode={isDarkMode} onToggleTheme={() => setIsDarkMode((prev) => !prev)} />
      <main className="mx-auto flex w-full max-w-[1360px] flex-col gap-2 px-3 py-2.5 md:gap-2.5 md:px-4 md:py-3">
        <ControlsRow geographies={geographies} sectors={sectors} horizons={horizons} />
        <KpiGrid metrics={metrics} />

        <section className="grid gap-2 xl:grid-cols-[1.24fr_0.76fr]">
          <MapCard />
          <ChartCard />
        </section>

        <MethodologyCard />
      </main>
      <Footer />
    </div>
  )
}

export default App
