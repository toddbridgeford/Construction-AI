// scripts/providers/fmp.mjs
import { fetchJson, utcYYYYMMDD, clamp } from "../lib/http.mjs";

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// FMP endpoints vary by plan; we try the best common patterns + safe fallbacks.
// We aim for: 1w, 1m, ytd changes (%). If not available, we fallback to what we can.
async function fetchPriceChangeBatch({ apiKey, tickers }) {
  // Attempt: /api/v3/stock-price-change/AAPL,MSFT?apikey=
  const base = "https://financialmodelingprep.com/api/v3/stock-price-change/";
  const url = `${base}${tickers.join(",")}?apikey=${encodeURIComponent(apiKey)}`;
  const json = await fetchJson(url, { timeoutMs: 12000, retries: 2 });
  const arr = Array.isArray(json) ? json : (Array.isArray(json?.historicalStockList) ? json.historicalStockList : []);
  return arr;
}

async function fetchQuoteBatch({ apiKey, tickers }) {
  // /api/v3/quote/AAPL,MSFT?apikey=
  const base = "https://financialmodelingprep.com/api/v3/quote/";
  const url = `${base}${tickers.join(",")}?apikey=${encodeURIComponent(apiKey)}`;
  const json = await fetchJson(url, { timeoutMs: 12000, retries: 2 });
  return Array.isArray(json) ? json : [];
}

function pickChangeRow(symbol, priceChangeRows, quoteRows) {
  const pc = priceChangeRows.find(r => (r?.symbol || "").toUpperCase() === symbol);
  const qt = quoteRows.find(r => (r?.symbol || "").toUpperCase() === symbol);

  // FMP field names commonly: 1D, 5D, 1M, 3M, 6M, 1Y, ytd (varies)
  const oneWeek = pc?.["5D"] ?? pc?.["5d"] ?? pc?.["5Day"] ?? null;
  const oneMonth = pc?.["1M"] ?? pc?.["1m"] ?? null;
  const ytd = pc?.["ytd"] ?? pc?.["YTD"] ?? null;

  // Quote fallback: changesPercentage is usually daily
  const dailyPct = qt?.changesPercentage ?? null;

  return {
    price_change_1w: (typeof oneWeek === "number") ? oneWeek : null,
    price_change_1m: (typeof oneMonth === "number") ? oneMonth : null,
    price_change_ytd: (typeof ytd === "number") ? ytd : null,
    daily_change_pct: (typeof dailyPct === "number") ? dailyPct : null,
    price: (typeof qt?.price === "number") ? qt.price : null
  };
}

function flagFromMomentum(x) {
  // x is percent return over 1m; conservative thresholds
  if (x == null) return "MONITOR";
  if (x <= -6) return "WATCH";
  if (x <= -3) return "MONITOR";
  if (x >= 6) return "MONITOR";
  return "MONITOR";
}

export async function fetchFMPMarkets({ apiKey, universe }) {
  const items = Array.isArray(universe?.tickers) ? universe.tickers : [];
  const symbols = items.map(x => String(x.ticker).toUpperCase()).filter(Boolean);

  if (!apiKey) {
    return {
      asof: utcYYYYMMDD(),
      source: "fmp",
      error: "Missing FMP_API_KEY",
      universe: [],
      subsector_momentum: {}
    };
  }

  // Keep batch sizes reasonable
  const batches = chunk(symbols, 25);

  const allPriceChange = [];
  const allQuotes = [];

  for (const b of batches) {
    // Try price changes (may fail on some plans)
    try {
      const pc = await fetchPriceChangeBatch({ apiKey, tickers: b });
      allPriceChange.push(...pc);
    } catch {
      // swallow, fallback to quote only
    }

    try {
      const qt = await fetchQuoteBatch({ apiKey, tickers: b });
      allQuotes.push(...qt);
    } catch (e) {
      // if quote fails, that’s a real problem
      throw e;
    }
  }

  const rows = [];
  for (const it of items) {
    const ticker = String(it.ticker).toUpperCase();
    const picked = pickChangeRow(ticker, allPriceChange, allQuotes);

    // prefer 1m for flagging; fallback to daily if needed
    const flag = flagFromMomentum(picked.price_change_1m ?? picked.daily_change_pct);

    rows.push({
      ticker,
      company_name: it.company_name || ticker,
      subsector: it.subsector || "Other",
      price: picked.price,
      price_change_1w: picked.price_change_1w,
      price_change_1m: picked.price_change_1m,
      price_change_ytd: picked.price_change_ytd,
      signal_flag: flag
    });
  }

  // Subsector momentum: average 1m (fallback daily)
  const buckets = {};
  const counts = {};
  for (const r of rows) {
    const k = r.subsector || "Other";
    const v = (r.price_change_1m ?? r.price_change_1w ?? r.price_change_ytd ?? r.daily_change_pct);
    if (typeof v !== "number") continue;
    buckets[k] = (buckets[k] || 0) + v;
    counts[k] = (counts[k] || 0) + 1;
  }

  const subsector_momentum = {};
  for (const [k, sum] of Object.entries(buckets)) {
    const n = counts[k] || 1;
    // map average return into 0–100 momentum index (50 neutral)
    const avg = sum / n;
    const idx = clamp(Math.round(50 + avg * 2.5), 0, 100); // 20% -> +50 points cap-ish
    subsector_momentum[k] = idx;
  }

  return {
    asof: utcYYYYMMDD(),
    source: "fmp",
    universe: rows,
    subsector_momentum
  };
}
