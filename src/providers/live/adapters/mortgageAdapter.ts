import type { NormalizedSourcePayload } from '../types'
import { asArray, isRecord, normalizeObservation } from './shared'

export function adaptMortgagePayload(payload: unknown): NormalizedSourcePayload {
  const rows = isRecord(payload) ? asArray(payload.series ?? payload.data ?? payload.observations) : asArray(payload)
  const observations = rows
    .map((row) => (isRecord(row) ? normalizeObservation(row, { indicatorId: 'cost_index', defaultGeographyLevel: 'us', defaultGeographyId: 'us' }) : null))
    .filter((row): row is NonNullable<typeof row> => Boolean(row))

  return {
    source: 'Mortgage',
    observations,
    mapData: [],
    notes: observations.length ? [] : ['Mortgage payload parsed with zero points.']
  }
}
