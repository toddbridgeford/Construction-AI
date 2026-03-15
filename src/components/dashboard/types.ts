export type KpiMetric = {
  label: string
  value: string
  delta: string
  trend: 'up' | 'down' | 'flat'
}

export type DashboardOption = {
  label: string
  value: string
}
