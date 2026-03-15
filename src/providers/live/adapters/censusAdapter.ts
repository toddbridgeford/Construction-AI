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

const normalizeMonthlyDate = (rawDate: unknown): string | null => {
  if (typeof rawDate !== 'string') return null
  const trimmed = rawDate.trim()
  if (/^\d{4}-\d{2}$/.test(trimmed)) return trimmed

  const ymd = trimmed.match(/^(\d{4})-(\d{2})-\d{2}$/)
  if (ymd) return `${ymd[1]}-${ymd[2]}`

  const compact = trimmed.match(/^(\d{4})(\d{2})$/)
  if (compact) return `${compact[1]}-${compact[2]}`

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

export function adaptCensusVipPayload(payload: unknown): Array<{ date: string; value: number }> {
  const rows = asArray(payload)

  return rows
    .map((row) => {
      if (!isRecord(row)) return null

      const date = normalizeMonthlyDate(row.date ?? row.period ?? row.month ?? row.time)
      const rawValue = toNumber(row.value ?? row.amount ?? row.observation ?? row.observation_value)
      if (!date || rawValue == null) return null

      const normalizedUnit = typeof row.unit === 'string' ? row.unit.toLowerCase() : ''
      const normalizedValue = normalizedUnit.includes('million') ? rawValue / 1000 : rawValue

      return {
        date,
        value: Number(normalizedValue.toFixed(3))
      }
    })
    .filter((row): row is { date: string; value: number } => row != null)
    .sort((a, b) => a.date.localeCompare(b.date))
}
