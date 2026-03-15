import type { MapDatum } from '@/data/types'
import type { NormalizedSourcePayload } from '../types'
import { asArray, isRecord, normalizeObservation } from './shared'

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''))
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

export function adaptCensusPayload(payload: unknown, indicatorId = 'starts'): NormalizedSourcePayload {
  const rows = asArray(payload)

  const observations = rows
    .map((row) => (isRecord(row) ? normalizeObservation(row, { indicatorId, defaultGeographyLevel: 'us', defaultGeographyId: 'us' }) : null))
    .filter((row): row is NonNullable<typeof row> => Boolean(row))

  const mapData: MapDatum[] = rows
    .map((row) => {
      if (!isRecord(row)) return null
      const stateId = typeof row.stateId === 'string' ? row.stateId : typeof row.state === 'string' ? row.state : null
      const stateName = typeof row.stateName === 'string' ? row.stateName : stateId
      const value = toNumber(row.value ?? row.permits)
      if (!stateId || !stateName || value == null) return null
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
