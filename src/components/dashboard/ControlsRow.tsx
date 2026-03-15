import { useState } from 'react'

import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import type { DashboardOption } from './types'

type ControlsRowProps = {
  geographies: DashboardOption[]
  sectors: DashboardOption[]
  horizons: DashboardOption[]
}

const divider = <span className="hidden h-4 w-px bg-border/85 lg:block" />

export function ControlsRow({ geographies, sectors, horizons }: ControlsRowProps) {
  const [forecastEnabled, setForecastEnabled] = useState(true)

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-border/85 bg-card/78 p-2 shadow-panel md:flex-row md:items-center md:gap-1.5">
      <div className="px-1 md:pr-1.5 lg:pr-2.5">
        <p className="text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground">Control Surface</p>
        <p className="mt-0.5 text-[11px] text-foreground/95">Filter market dimensions and forecast window</p>
      </div>

      {divider}
      <Select options={geographies} defaultValue={geographies[0]?.value} className="md:min-w-[9.2rem]" />
      <Select options={sectors} defaultValue={sectors[0]?.value} className="md:min-w-[8.4rem]" />

      <div className="flex items-center justify-between rounded-md border border-border/85 bg-background/50 px-2 py-[5px] md:ml-auto md:min-w-[8.6rem]">
        <span className="text-[10.5px] tracking-[0.03em] text-muted-foreground">Forecast</span>
        <Switch checked={forecastEnabled} onCheckedChange={setForecastEnabled} />
      </div>

      <Select options={horizons} defaultValue={horizons[0]?.value} className="md:min-w-[7.2rem]" />
    </section>
  )
}
