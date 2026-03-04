import type { TickerItem } from "../types";

const DEFAULT_SYMBOLS = ["SPY", "QQQ", "DIA", "XLI"];

export function getSymbols(rawSymbols?: string): string[] {
  const parsed = (rawSymbols ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : DEFAULT_SYMBOLS;
}

export async function fetchTickers(symbols: string[]): Promise<TickerItem[]> {
  const results = await Promise.all(symbols.map((symbol) => fetchStooqQuote(symbol)));
  return results.filter((item): item is TickerItem => Boolean(item));
}

async function fetchStooqQuote(symbol: string): Promise<TickerItem | null> {
  const endpoint = new URL("https://stooq.com/q/l/");
  endpoint.searchParams.set("s", `${symbol.toLowerCase()}.us`);
  endpoint.searchParams.set("f", "sd2t2ohlcvn");
  endpoint.searchParams.set("h", "");
  endpoint.searchParams.set("e", "json");

  const response = await fetch(endpoint.toString());
  if (!response.ok) return null;

  const payload = (await response.json()) as { symbols?: Array<Record<string, string>> };
  const row = payload.symbols?.[0];
  if (!row) return null;

  const close = Number(row.close);
  const open = Number(row.open);
  if (Number.isNaN(close) || Number.isNaN(open)) return null;

  const change = close - open;
  const changePct = open === 0 ? 0 : (change / open) * 100;

  return {
    symbol,
    price: round(close),
    change: round(change),
    changePct: round(changePct),
  };
}

function round(value: number): number {
  return Number(value.toFixed(2));
}
