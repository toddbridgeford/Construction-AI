import type { NormalizedSourcePayload } from '../types'
import { asArray, isRecord, normalizeObservation } from './shared'

export function adaptBlsPayload(payload: unknown): NormalizedSourcePayload {
  const series = isRecord(payload) ? asArray(payload.series ?? payload.Results) : []
  const firstSeries = series.find((item) => isRecord(item))
  const rows = isRecord(firstSeries) ? asArray(firstSeries.data ?? firstSeries.observations) : []

  const observations = rows
    .map((row) => (isRecord(row) ? normalizeObservation(row, { indicatorId: 'employment', defaultGeographyLevel: 'us', defaultGeographyId: 'us' }) : null))
    .filter((row): row is NonNullable<typeof row> => Boolean(row))

  return {
    source: 'BLS',
    observations,
    mapData: [],
    notes: observations.length ? [] : ['BLS payload parsed with zero points.']
  }
}
