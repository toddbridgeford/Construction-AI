const MARKET_REGISTRY = [
  "nashville",
  "austin",
  "dallas",
  "phoenix",
  "atlanta",
  "denver",
  "charlotte",
  "tampa",
];

const COMPONENT_CONFIG = [
  { component: "capital", provider: "FRED", key: "BUSLOANS" },
  { component: "pipeline", provider: "USAspending", key: "default" },
  { component: "trade", provider: "BLS", key: "CES2000000008" },
  { component: "materials", provider: "BLS", key: "WPU101" },
  { component: "regulatory", provider: "NEWS", key: "regulation" },
  { component: "macro", provider: "ALPHAVANTAGE", key: "SPY" },
];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });

    try {
      if (path === "/" || path === "/health") {
        return json({ ok: true, service: "construction-ai-terminal" });
      }

      if (path === "/cpi" && request.method === "GET") {
        const market = requireMarket(url.searchParams.get("location"));
        const snapshot = await env.CPI_SNAPSHOTS.get(`cpi:${market}`, "json");
        if (!snapshot) return json({ error: "not_found", message: `No CPI snapshot for ${market}` }, 404);
        return json(snapshot);
      }

      if (path === "/market" && request.method === "GET") {
        const market = requireMarket(url.searchParams.get("location"));
        const snapshot = await env.CPI_SNAPSHOTS.get(`market:${market}`, "json");
        if (!snapshot) return json({ error: "not_found", message: `No market snapshot for ${market}` }, 404);
        return json(snapshot);
      }

      if (path === "/rank/metros" && request.method === "GET") {
        const leaderboard = await env.CPI_SNAPSHOTS.get("leaderboard:metros", "json");
        if (!leaderboard) return json({ error: "not_found", message: "No leaderboard snapshot" }, 404);
        return json(leaderboard);
      }

      if (path === "/refresh" && request.method === "GET") {
        const market = normalizeMarket(url.searchParams.get("location"));
        const result = await runSnapshotRefresh(env, ctx, market ? [market] : getMarketRegistry(env));
        return json({ ok: true, ...result });
      }

      if (path === "/fred/observations" && request.method === "GET") {
        const payload = await fetchFredObservations(url.searchParams.get("series_id"), env);
        return json(payload);
      }

      if (path === "/bls/timeseries" && request.method === "POST") {
        const body = await request.json();
        return json(await postJson("https://api.bls.gov/publicAPI/v2/timeseries/data/", body));
      }

      if (path === "/usaspending/awards" && request.method === "POST") {
        const body = await request.json();
        return json(await postJson("https://api.usaspending.gov/api/v2/search/spending_by_award/", body));
      }

      if (path.startsWith("/alphavantage/") && request.method === "GET") {
        const route = path.split("/").pop();
        return json(await proxyAlphaVantage(route, url.searchParams, env));
      }

      if (path === "/news/feeds" && request.method === "GET") {
        const feeds = (env.NEWS_FEEDS || "").split(",").map((x) => x.trim()).filter(Boolean);
        const results = await Promise.all(feeds.map(async (feed) => {
          const res = await fetch(feed);
          return { feed, status: res.status, body: (await res.text()).slice(0, 1000) };
        }));
        return json({ count: results.length, results });
      }

      return json({ error: "not_found", path }, 404);
    } catch (error) {
      return json({ error: "internal_error", message: String(error?.message || error) }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runSnapshotRefresh(env, ctx, getMarketRegistry(env), event?.cron));
  },
};

async function runSnapshotRefresh(env, ctx, markets, cron = null) {
  const generated_at_utc = new Date().toISOString();
  const snapshots = await Promise.all(markets.map(async (market) => {
    const marketSnapshot = await computeMarketSnapshot(market, env, ctx, generated_at_utc);
    await env.CPI_SNAPSHOTS.put(`market:${market}`, JSON.stringify(marketSnapshot));
    await env.CPI_SNAPSHOTS.put(`cpi:${market}`, JSON.stringify(marketSnapshot.cpi));
    return { market, headline_cpi: marketSnapshot.cpi.headline_cpi, zone: marketSnapshot.cpi.zone, delta_3m: marketSnapshot.cpi.delta_3m };
  }));

  const marketsRanked = snapshots.sort((a, b) => b.headline_cpi - a.headline_cpi).map((item, idx) => ({ rank: idx + 1, ...item }));
  await env.CPI_SNAPSHOTS.put("leaderboard:metros", JSON.stringify({ generated_at_utc, cron, markets: marketsRanked }));

  return { generated_at_utc, market_count: snapshots.length, leaderboard_count: marketsRanked.length };
}

async function computeMarketSnapshot(market, env, ctx, generated_at_utc) {
  const components = {};

  await Promise.all(COMPONENT_CONFIG.map(async (cfg) => {
    const series = await fetchProviderSeries(cfg, market, env, ctx);
    const values = series.map((p) => p.value).filter(Number.isFinite);
    const latest = values.at(-1) ?? 0;
    const lag3 = values.at(-4) ?? latest;
    const score = scoreFromSeries(values);
    components[cfg.component] = clamp(Math.round(score), 0, 100);
    components[`${cfg.component}_delta_3m`] = Math.round((latest - lag3) * 100) / 100;
  }));

  const componentScores = Object.fromEntries(Object.entries(components).filter(([k]) => !k.endsWith("_delta_3m")));
  const deltas = Object.entries(components).filter(([k]) => k.endsWith("_delta_3m")).map(([, v]) => v);
  const headline = average(Object.values(componentScores));
  const delta_3m = average(deltas);

  const cpi = {
    market,
    headline_cpi: Math.round(headline),
    zone: zoneForScore(headline),
    delta_3m: Math.round(delta_3m),
    components: componentScores,
    generated_at_utc,
  };

  return { market, generated_at_utc, cpi, market_signals: componentScores };
}

async function fetchProviderSeries(cfg, market, env) {
  try {
    if (cfg.provider === "FRED" && env.FRED_API_KEY) {
      const data = await fetchFredObservations(cfg.key, env);
      return (data.observations || []).map((o) => ({ date: o.date, value: Number(o.value) })).filter((o) => Number.isFinite(o.value));
    }
    if (cfg.provider === "BLS") {
      const year = new Date().getUTCFullYear();
      const body = { seriesid: [cfg.key], startyear: String(year - 5), endyear: String(year) };
      if (env.BLS_API_KEY) body.registrationKey = env.BLS_API_KEY;
      const data = await postJson("https://api.bls.gov/publicAPI/v2/timeseries/data/", body);
      return ((data?.Results?.series?.[0]?.data) || []).map((d) => ({ date: `${d.year}-${d.periodName || d.period}`, value: Number(d.value) })).filter((o) => Number.isFinite(o.value)).reverse();
    }
    if (cfg.provider === "USAspending") {
      const payload = await postJson("https://api.usaspending.gov/api/v2/search/spending_by_award/", { limit: 1, page: 1 });
      return [{ date: new Date().toISOString().slice(0, 10), value: Number(payload?.page_metadata?.total || 0) }];
    }
    if (cfg.provider === "ALPHAVANTAGE" && env.ALPHAVANTAGE_API_KEY) {
      const data = await proxyAlphaVantage("daily", new URLSearchParams({ symbol: cfg.key }), env);
      const ts = data["Time Series (Daily)"] || {};
      return Object.entries(ts).map(([date, row]) => ({ date, value: Number(row["4. close"]) })).filter((o) => Number.isFinite(o.value)).sort((a, b) => a.date.localeCompare(b.date));
    }
    if (cfg.provider === "NEWS") {
      const feeds = (env.NEWS_FEEDS || "").split(",").map((x) => x.trim()).filter(Boolean);
      if (!feeds.length) return syntheticSeries(market, cfg.component);
      const texts = await Promise.all(feeds.map(async (feed) => (await fetch(feed)).text()));
      const count = texts.join(" ").toLowerCase().split(cfg.key).length - 1;
      return [{ date: new Date().toISOString().slice(0, 10), value: Math.max(1, count) }];
    }
  } catch {
    return syntheticSeries(market, cfg.component);
  }
  return syntheticSeries(market, cfg.component);
}

async function fetchFredObservations(series_id, env) {
  if (!series_id) throw new Error("Missing series_id");
  if (!env.FRED_API_KEY) throw new Error("Missing FRED_API_KEY");
  const url = new URL("https://api.stlouisfed.org/fred/series/observations");
  url.searchParams.set("series_id", series_id);
  url.searchParams.set("api_key", env.FRED_API_KEY);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("sort_order", "asc");
  url.searchParams.set("limit", "120");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FRED failed (${res.status})`);
  return res.json();
}

async function proxyAlphaVantage(route, searchParams, env) {
  if (!env.ALPHAVANTAGE_API_KEY) throw new Error("Missing ALPHAVANTAGE_API_KEY");
  const fn = route === "quote" ? "GLOBAL_QUOTE" : route === "intraday" ? "TIME_SERIES_INTRADAY" : route === "news" ? "NEWS_SENTIMENT" : "TIME_SERIES_DAILY";
  const url = new URL("https://www.alphavantage.co/query");
  url.searchParams.set("function", fn);
  for (const [k, v] of searchParams.entries()) url.searchParams.set(k, v);
  if (fn === "TIME_SERIES_INTRADAY" && !url.searchParams.get("interval")) url.searchParams.set("interval", "5min");
  url.searchParams.set("apikey", env.ALPHAVANTAGE_API_KEY);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Alpha Vantage failed (${res.status})`);
  return res.json();
}

async function postJson(url, body) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
  if (!res.ok) throw new Error(`POST ${url} failed (${res.status})`);
  return res.json();
}

function getMarketRegistry(env) {
  try {
    const parsed = JSON.parse(env.MARKET_REGISTRY_JSON || "[]");
    const values = Array.isArray(parsed) ? parsed.map((m) => typeof m === "string" ? normalizeMarket(m) : normalizeMarket(m.market)).filter(Boolean) : [];
    return values.length ? [...new Set(values)] : MARKET_REGISTRY;
  } catch {
    return MARKET_REGISTRY;
  }
}

function scoreFromSeries(values) {
  if (values.length < 2) return 50;
  const mean = average(values);
  const std = Math.sqrt(average(values.map((v) => (v - mean) ** 2)));
  const latest = values.at(-1) ?? mean;
  const z = std === 0 ? 0 : (latest - mean) / std;
  return 50 + 50 * Math.tanh(z / 2);
}

function zoneForScore(score) {
  if (score <= 39) return "Stress";
  if (score <= 59) return "Slowdown";
  if (score <= 74) return "Watch";
  return "Expansion";
}

function requireMarket(value) {
  const market = normalizeMarket(value);
  if (!market) throw new Error("Missing required query parameter: location");
  return market;
}

function normalizeMarket(value) {
  return String(value || "").trim().toLowerCase();
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((acc, v) => acc + v, 0) / values.length;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function syntheticSeries(market, component) {
  const seed = `${market}:${component}`.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const base = (seed % 40) + 30;
  return Array.from({ length: 24 }, (_, i) => ({ date: `2024-${String((i % 12) + 1).padStart(2, "0")}-01`, value: base + Math.sin(i / 3) * 5 + (i % 4) }));
}

function corsHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: corsHeaders() });
}
