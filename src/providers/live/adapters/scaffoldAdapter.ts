import type { NormalizedSourcePayload } from '../types'

export function scaffoldAdapter(source: 'HUD' | 'BEA'): NormalizedSourcePayload {
  return {
    source,
    observations: [],
    mapData: [],
    notes: [`${source} adapter scaffold is present but not yet wired to endpoint-specific mappings.`]
  }
}
