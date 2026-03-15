import type { NormalizedSourcePayload } from '../types'
import { asArray, isRecord, normalizeObservation } from './shared'

export function adaptFredPayload(payload: unknown, indicatorId = 'permits'): NormalizedSourcePayload {
  const rows = isRecord(payload) ? asArray(payload.observations ?? payload.data) : []
  const observations = rows
    .map((row) => (isRecord(row) ? normalizeObservation(row, { indicatorId, defaultGeographyLevel: 'us', defaultGeographyId: 'us' }) : null))
    .filter((row): row is NonNullable<typeof row> => Boolean(row))

  return {
    source: 'FRED',
    observations,
    mapData: [],
    notes: observations.length ? [] : ['FRED payload parsed with zero points.']
  }
}
