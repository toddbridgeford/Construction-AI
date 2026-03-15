import type { IndicatorDefinition, KpiValue, MapDatum, Observation, Series } from '@/data/types'

export const toSeries = (
  observations: Observation[],
  geographyLevel: string,
  geographyId: string,
  indicatorId: string
): Series => {
  const points = observations
    .filter(
      (observation) =>
        observation.geographyLevel === geographyLevel &&
        observation.geographyId === geographyId &&
        observation.indicatorId === indicatorId
    )
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((observation) => ({ date: observation.date, value: observation.value }))

  return {
    indicatorId,
    geographyLevel: geographyLevel as Series['geographyLevel'],
    geographyId,
    points
  }
}

const changePct = (current: number | undefined, previous: number | undefined): number | null => {
  if (current == null || previous == null || previous === 0) return null
  return ((current - previous) / previous) * 100
}

export const buildKpis = ({
  selectedIndicator,
  indicators,
  series,
  comparisonSeries
}: {
  selectedIndicator: string
  indicators: IndicatorDefinition[]
  series: Series
  comparisonSeries: Series
}): KpiValue[] => {
  const indicator = indicators.find((item) => item.id === selectedIndicator)
  const current = series.points.at(-1)?.value
  const previous = series.points.at(-2)?.value
  const yearAgo = series.points.at(-13)?.value

  const secondaryCurrent = comparisonSeries.points.at(-1)?.value
  const secondaryPrev = comparisonSeries.points.at(-2)?.value
  const secondaryYearAgo = comparisonSeries.points.at(-13)?.value

  return [
    {
      label: indicator?.name ?? 'Current Value',
      value: current ?? null,
      momChange: changePct(current, previous),
      yoyChange: changePct(current, yearAgo),
      unit: 'index'
    },
    {
      label: 'Companion Indicator',
      value: secondaryCurrent ?? null,
      momChange: changePct(secondaryCurrent, secondaryPrev),
      yoyChange: changePct(secondaryCurrent, secondaryYearAgo),
      unit: 'index'
    },
    {
      label: 'Three-Month Avg',
      value: series.points.slice(-3).reduce((acc, point) => acc + point.value, 0) / Math.max(series.points.slice(-3).length, 1),
      momChange: changePct(
        series.points.slice(-3).reduce((acc, point) => acc + point.value, 0) / Math.max(series.points.slice(-3).length, 1),
        series.points.slice(-6, -3).reduce((acc, point) => acc + point.value, 0) / Math.max(series.points.slice(-6, -3).length, 1)
      ),
      yoyChange: null,
      unit: 'index'
    },
    {
      label: '12-Month High',
      value: Math.max(...series.points.slice(-12).map((point) => point.value)),
      momChange: null,
      yoyChange: null,
      unit: 'index'
    }
  ]
}

export const mapDataByIndicator = (mapData: MapDatum[], indicatorId: string) =>
  mapData.filter((entry) => entry.indicatorId === indicatorId)
