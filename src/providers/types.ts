import type { DashboardData, ForecastRequest, ForecastResponse } from '@/data/types'

export interface DataProvider {
  getDashboardData(): Promise<DashboardData>
  getForecast(request: ForecastRequest): Promise<ForecastResponse>
}
