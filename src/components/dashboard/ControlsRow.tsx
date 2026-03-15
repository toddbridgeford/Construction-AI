import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import type { DashboardOption } from './types'

type ControlsRowProps = {
  geographyLevels: DashboardOption[]
  selectedGeographyLevel: string
  onGeographyLevelChange: (value: string) => void
  regions: DashboardOption[]
  selectedRegion: string
  onRegionChange: (value: string) => void
  states: DashboardOption[]
  selectedState: string
  onStateChange: (value: string) => void
  metros: DashboardOption[]
  selectedMetro: string
  onMetroChange: (value: string) => void
  indicatorGroups: DashboardOption[]
  selectedIndicatorGroup: string
  onIndicatorGroupChange: (value: string) => void
  indicators: DashboardOption[]
  selectedIndicator: string
  onIndicatorChange: (value: string) => void
  forecastEnabled: boolean
  onForecastToggle: (value: boolean) => void
}

const divider = <span className="hidden h-4 w-px bg-border/85 lg:block" />

export function ControlsRow(props: ControlsRowProps) {
  const {
    geographyLevels,
    selectedGeographyLevel,
    onGeographyLevelChange,
    regions,
    selectedRegion,
    onRegionChange,
    states,
    selectedState,
    onStateChange,
    metros,
    selectedMetro,
    onMetroChange,
    indicatorGroups,
    selectedIndicatorGroup,
    onIndicatorGroupChange,
    indicators,
    selectedIndicator,
    onIndicatorChange,
    forecastEnabled,
    onForecastToggle
  } = props

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-border/85 bg-card/78 p-2 shadow-panel md:flex-row md:flex-wrap md:items-center md:gap-1.5">
      <div className="px-1 md:pr-1.5 lg:pr-2.5">
        <p className="text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground">Control Surface</p>
        <p className="mt-0.5 text-[11px] text-foreground/95">Drive geography and indicator views in demo mode</p>
      </div>

      {divider}
      <Select options={geographyLevels} value={selectedGeographyLevel} onChange={onGeographyLevelChange} className="md:min-w-[8rem]" />
      {selectedGeographyLevel !== 'us' && (
        <Select options={regions} value={selectedRegion} onChange={onRegionChange} className="md:min-w-[8rem]" />
      )}
      {(selectedGeographyLevel === 'state' || selectedGeographyLevel === 'metro') && (
        <Select options={states} value={selectedState} onChange={onStateChange} className="md:min-w-[8rem]" />
      )}
      {selectedGeographyLevel === 'metro' && (
        <Select options={metros} value={selectedMetro} onChange={onMetroChange} className="md:min-w-[8rem]" />
      )}

      {selectedGeographyLevel === 'us' && (
        <Select options={indicatorGroups} value={selectedIndicatorGroup} onChange={onIndicatorGroupChange} className="md:min-w-[9rem]" />
      )}
      <Select options={indicators} value={selectedIndicator} onChange={onIndicatorChange} className="md:min-w-[10rem]" />

      <div className="flex items-center justify-between rounded-md border border-border/85 bg-background/50 px-2 py-[5px] md:ml-auto md:min-w-[8.6rem]">
        <span className="text-[10.5px] tracking-[0.03em] text-muted-foreground">Forecast</span>
        <Switch checked={forecastEnabled} onCheckedChange={onForecastToggle} />
      </div>
    </section>
  )
}
