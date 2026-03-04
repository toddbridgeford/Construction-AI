import type { ConstructionItem, DashboardPayload, NewsItem, SignalItem, TickerItem } from "./types";

export function buildPayload(input: {
  tickers: TickerItem[];
  news: NewsItem[];
  construction: ConstructionItem[];
  signals: SignalItem[];
  generatedAt?: string;
}): DashboardPayload {
  const payload: DashboardPayload = {
    generated_at: input.generatedAt ?? new Date().toISOString(),
    tickers: input.tickers.slice(0, 20),
    news: input.news.slice(0, 20),
    construction: input.construction.slice(0, 20),
    signals: input.signals.slice(0, 20),
  };

  validatePayload(payload);
  return payload;
}

export function validatePayload(payload: DashboardPayload): void {
  if (!payload.generated_at || Number.isNaN(Date.parse(payload.generated_at))) {
    throw new Error("generated_at must be a valid ISO timestamp");
  }

  for (const ticker of payload.tickers) {
    if (!ticker.symbol) throw new Error("ticker.symbol is required");
    if (![ticker.price, ticker.change, ticker.changePct].every(Number.isFinite)) {
      throw new Error(`ticker numeric fields must be finite for ${ticker.symbol}`);
    }
  }

  for (const article of payload.news) {
    if (!article.title || !article.source || !article.url) {
      throw new Error("news entries must include title, source, and url");
    }
  }

  for (const signal of payload.signals) {
    if (!["up", "down", "flat"].includes(signal.direction)) {
      throw new Error(`invalid signal direction: ${signal.direction}`);
    }
  }
}
