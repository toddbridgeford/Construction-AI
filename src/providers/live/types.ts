import type { GeographyLevel, IndicatorDefinition, MapDatum, Metadata, Observation } from '@/data/types'

export type NormalizedSourcePayload = {
  source: string
  metadataPatch?: Partial<Metadata>
  indicators?: IndicatorDefinition[]
  observations: Observation[]
  mapData: MapDatum[]
  notes?: string[]
}

export type AdapterContext = {
  defaultGeographyLevel?: GeographyLevel
  defaultGeographyId?: string
  indicatorId: string
}

export type LiveSourceConfig = {
  id: 'fred' | 'bls' | 'census' | 'mortgage' | 'hud' | 'bea'
  name: string
  path: string
  apiKey?: string
  indicatorId: string
  required: boolean
}
