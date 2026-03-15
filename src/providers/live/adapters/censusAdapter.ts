import type { MapDatum } from '@/data/types'
import type { NormalizedSourcePayload } from '../types'
import { asArray, isRecord, normalizeObservation } from './shared'

export function adaptCensusPayload(payload: unknown): NormalizedSourcePayload {
  const rows = asArray(payload)

  const observations = rows
    .map((row) => (isRecord(row) ? normalizeObservation(row, { indicatorId: 'starts', defaultGeographyLevel: 'us', defaultGeographyId: 'us' }) : null))
    .filter((row): row is NonNullable<typeof row> => Boolean(row))

  const mapData: MapDatum[] = rows
    .map((row) => {
      if (!isRecord(row)) return null
      const stateId = typeof row.stateId === 'string' ? row.stateId : typeof row.state === 'string' ? row.state : null
      const stateName = typeof row.stateName === 'string' ? row.stateName : stateId
      const rawValue = row.value
      const value = typeof rawValue === 'number' ? rawValue : typeof rawValue === 'string' ? Number(rawValue) : Number.NaN
      if (!stateId || !stateName || !Number.isFinite(value)) return null
      return { stateId, stateName, indicatorId: 'permits', value }
    })
    .filter((row): row is MapDatum => Boolean(row))

  return {
    source: 'Census',
    observations,
    mapData,
    notes: observations.length || mapData.length ? [] : ['Census payload parsed with zero points.']
  }
}
