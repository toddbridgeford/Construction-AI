export type TrendDirection = "up" | "down" | "flat";

export interface TickerItem {
  symbol: string;
  price: number;
  change: number;
  changePct: number;
}

export interface NewsItem {
  title: string;
  source: string;
  url: string;
  publishedAt: string;
}

export interface ConstructionItem {
  title: string;
  value: string;
  source: string;
}

export interface SignalItem {
  name: string;
  value: string;
  direction: TrendDirection;
}

export interface DashboardPayload {
  generated_at: string;
  tickers: TickerItem[];
  news: NewsItem[];
  construction: ConstructionItem[];
  signals: SignalItem[];
}

export interface SnapshotRecord {
  timestamp: string;
  payload: DashboardPayload;
}

export interface Env {
  DASHBOARD_KV: KVNamespace;
  ALPHAVANTAGE_API_KEY?: string;
  NEWSAPI_KEY?: string;
  SYMBOLS?: string;
  HISTORY_LIMIT?: string;
  ALLOWED_ORIGIN?: string;
}
