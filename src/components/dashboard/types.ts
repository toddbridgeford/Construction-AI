import type { GeographyLevel, KpiValue, SeriesPoint } from '@/data/types'

export type DashboardOption = {
  label: string
  value: string
}

export type SelectorState = {
  geographyLevel: GeographyLevel
  regionId: string
  stateId: string
  metroId: string
  indicatorId: string
  range: 'all' | '10y' | '5y' | '3y' | '1y'
  forecastEnabled: boolean
}

export type KpiMetric = KpiValue & {
  trend: 'up' | 'down' | 'flat'
  deltaText: string
  yoyText: string
}

export type ChartHoverPoint = SeriesPoint & {
  x: number
  y: number
}
