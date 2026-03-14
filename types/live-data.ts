export type GeographyLevel = 'US' | 'Region' | 'State' | 'City/Metro';
export type DateRange = '1M' | '3M' | '6M' | '1Y' | '3Y' | '5Y' | 'YTD';

export type IndicatorKey =
  | 'permits'
  | 'spending'
  | 'residentialProxy'
  | 'labor'
  | 'materials'
  | 'mortgage';

export type NormalizedPoint = {
  date: string;
  actual: number;
  bestModel: number;
  benchmarkModel: number;
};

export type NormalizedDataset = {
  series: NormalizedPoint[];
  mapValues: Record<string, number>;
  metadata: {
    source: string;
    referencePeriod: string;
    isLive: boolean;
    note?: string;
  };
};
