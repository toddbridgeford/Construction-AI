import rawDashboardData from '@/data/dashboardData.json'
import type { DashboardData, ForecastRequest, ForecastResponse, GeographyLevel, Observation, Metadata, MapDatum } from '@/data/types'
import type { DataProvider } from './types'

type SeedRow = {
  geographyLevel: GeographyLevel
  geographyId: string
  indicatorId: string
  base: string
  trend: string
  seasonality: string
}

const START_DATE = new Date('2016-01-01T00:00:00.000Z')
const PERIODS = 120

const toNumber = (value: unknown): number => {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const normalized = Number(value)
    return Number.isFinite(normalized) ? normalized : 0
  }
  return 0
}

const formatDate = (date: Date) => date.toISOString().slice(0, 10)

function generateObservationSeries(seed: SeedRow): Observation[] {
  const base = toNumber(seed.base)
  const trend = toNumber(seed.trend)
  const seasonality = toNumber(seed.seasonality)

  return Array.from({ length: PERIODS }, (_, monthIndex) => {
    const pointDate = new Date(START_DATE)
    pointDate.setMonth(pointDate.getMonth() + monthIndex)

    const seasonalPattern = Math.sin((monthIndex % 12) * (Math.PI / 6)) * seasonality
    const cyclePattern = Math.sin(monthIndex / 4) * 0.75
    const value = Number((base + monthIndex * trend + seasonalPattern + cyclePattern).toFixed(2))

    return {
      date: formatDate(pointDate),
      geographyLevel: seed.geographyLevel,
      geographyId: seed.geographyId,
      indicatorId: seed.indicatorId,
      value
    }
  })
}

function normalizeDashboardData(): DashboardData {
  const metadata = rawDashboardData.metadata as Metadata
  const seeds = rawDashboardData.seriesSeeds as SeedRow[]
  const observations = seeds.flatMap((seed) => generateObservationSeries(seed))
  const mapData: MapDatum[] = rawDashboardData.mapData.map((entry) => ({
    ...entry,
    value: toNumber(entry.value)
  }))

  return {
    metadata,
    observations,
    mapData
  }
}

export class LocalJsonProvider implements DataProvider {
  private readonly data = normalizeDashboardData()

  async getDashboardData(): Promise<DashboardData> {
    return Promise.resolve(this.data)
  }

  async getForecast(request: ForecastRequest): Promise<ForecastResponse> {
    const matching = this.data.observations.filter(
      (observation) =>
        observation.geographyLevel === request.geographyLevel &&
        observation.geographyId === request.geographyId &&
        observation.indicatorId === request.indicatorId
    )
    const sourcePoints = matching.slice(-12)

    const projectedPoints = Array.from({ length: request.periods }, (_, index) => {
      const source = sourcePoints[index % Math.max(sourcePoints.length, 1)]
      const baseValue = source?.value ?? 100
      const projectionDate = new Date((source?.date ?? this.data.observations.at(-1)?.date) || '2025-01-01')
      projectionDate.setMonth(projectionDate.getMonth() + index + 1)

      return {
        date: formatDate(projectionDate),
        value: Number((baseValue * (1 + 0.004 * (index + 1))).toFixed(2))
      }
    })

    return Promise.resolve({ request, projectedPoints })
  }
}
