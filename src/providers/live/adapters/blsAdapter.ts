import type { NormalizedSourcePayload } from '../types'
import { asArray, isRecord, normalizeObservation } from './shared'

export function adaptBlsPayload(payload: unknown, indicatorId = 'employment'): NormalizedSourcePayload {
  const response = isRecord(payload) ? payload : null
  const results = response && isRecord(response.Results) ? response.Results : response
  const series = results ? asArray(results.series ?? results.seriesList ?? results.data) : []
  const firstSeries = series.find((item) => isRecord(item))
  const rows = isRecord(firstSeries) ? asArray(firstSeries.data ?? firstSeries.observations) : []

  const observations = rows
    .map((row) => (isRecord(row) ? normalizeObservation(row, { indicatorId, defaultGeographyLevel: 'us', defaultGeographyId: 'us' }) : null))
    .filter((row): row is NonNullable<typeof row> => Boolean(row))

  return {
    source: 'BLS',
    observations,
    mapData: [],
    notes: observations.length ? [] : ['BLS payload parsed with zero points.']
  }
}
