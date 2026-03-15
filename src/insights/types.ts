import type { GeographyLevel, SeriesPoint } from '@/data/types'
import type { ForecastOutput } from '@/forecasting'

export type InsightDirection = 'up' | 'down' | 'flat'
export type InsightStrength = 'low' | 'medium' | 'high'
export type InsightConfidence = 'low' | 'medium' | 'high'

export type RiskFlag = {
  id: string
  label: string
  direction: InsightDirection
  strength: InsightStrength
  confidence: InsightConfidence
  detail: string
}

export type MarketSignal = {
  direction: InsightDirection
  strength: InsightStrength
  confidence: InsightConfidence
  headline: string
  supportingPoints: string[]
  riskFlags: RiskFlag[]
  actionableInterpretation: string
}

export type ForecastOutlook = {
  direction: InsightDirection
  strength: InsightStrength
  confidence: InsightConfidence
  headline: string
  supportingPoints: string[]
  riskFlags: RiskFlag[]
  actionableInterpretation: string
}

export type InsightSummary = {
  direction: InsightDirection
  strength: InsightStrength
  confidence: InsightConfidence
  headline: string
  supportingPoints: string[]
  riskFlags: RiskFlag[]
  actionableInterpretation: string
}

export type InsightPanelData = {
  status: 'ready' | 'insufficient_data'
  summary: InsightSummary
  marketSignal: MarketSignal
  forecastOutlook: ForecastOutlook
  riskWatch: RiskFlag[]
  actionableInterpretation: string[]
}

export type InsightInput = {
  indicatorId: string
  indicatorName: string
  geographyLevel: GeographyLevel
  geographyLabel: string
  series: SeriesPoint[]
  comparison?: {
    label: string
    indicatorId: string
    series: SeriesPoint[]
  }
  nationalBenchmark?: {
    label: string
    series: SeriesPoint[]
  }
  forecastEnabled: boolean
  forecast?: ForecastOutput
}
