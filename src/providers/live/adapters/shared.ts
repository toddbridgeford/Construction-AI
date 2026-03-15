import type { GeographyLevel, Observation } from '@/data/types'
import type { AdapterContext } from '../types'

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''))
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

export const normalizeObservation = (raw: Record<string, unknown>, context: AdapterContext): Observation | null => {
  const date = typeof raw.date === 'string' ? raw.date : typeof raw.period === 'string' ? raw.period : null
  const value = toNumber(raw.value ?? raw.observation ?? raw.val)
  if (!date || value == null) return null

  const geographyLevel = (raw.geographyLevel as GeographyLevel | undefined) ?? context.defaultGeographyLevel ?? 'us'
  const geographyId = (raw.geographyId as string | undefined) ?? context.defaultGeographyId ?? 'us'

  return {
    date,
    geographyLevel,
    geographyId,
    indicatorId: context.indicatorId,
    value
  }
}

export const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value != null && !Array.isArray(value)

export const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])
