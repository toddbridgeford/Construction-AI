export type AudienceMode =
  | 'Lender / Investor'
  | 'Contractor'
  | 'Owner / Developer'
  | 'Manufacturer / Supplier'
  | 'Public Sector';

export type SignalTone = 'positive' | 'neutral' | 'caution' | 'negative';

export interface KPIItem {
  metric: string;
  latest: string;
  mom: string;
  yoy: string;
  takeaway: string;
  tone?: SignalTone;
}

export interface KPIGroup {
  id: string;
  title: string;
  items: KPIItem[];
}

export interface SegmentSignal {
  segment: string;
  signal: string;
  trend: string;
  whyItMatters: string;
  tone: SignalTone;
}

export interface ExposureItem {
  area: string;
  currentRead: string;
  watchpoint: string;
  tone: SignalTone;
}

export interface WatchItem {
  item: string;
  implication: string;
  horizon: string;
  tone: SignalTone;
}

export interface TrendPoint {
  period: string;
  value: number;
}

export interface DetailMetric {
  id: string;
  group: string;
  metric: string;
  latest: string;
  prior: string;
  mom: string;
  yoy: string;
  interpretation: string;
  sourceFamily: string;
  referencePeriod: string;
  note?: string;
  trendKey?: string;
}
