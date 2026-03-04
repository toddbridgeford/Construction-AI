/**
 * Cloudflare Worker: Multi-API Proxy + Dashboard
 * Routes:
 *   GET  /health
 *   GET  /fred?series_id=...&start=YYYY-MM-DD&end=YYYY-MM-DD
 *   POST /bls   { "series": ["CEU0000000001", ...], "startyear":"2022","endyear":"2024" }
 *   GET  /census?dataset=acs/acs5&year=2022&path=/groups/DP03&for=us:1&in=...
 *   GET  /eia?path=/v2/...&<any other eia query params>
 *   GET  /av?<alphavantage query params>
 *   GET  /news?<newsapi query params>
 *   GET  /dashboard
 */

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

// Basic CORS (tighten origin if you want)
function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "*";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,authorization",
    "access-control-max-age": "86400",
  };
}

function withCors(request, headers = {}) {
  return { ...headers, ...corsHeaders(request) };
}

function jsonResponse(request, obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: withCors(request, { ...JSON_HEADERS, ...extraHeaders }),
  });
}

function badRequest(request, message, details) {
  return jsonResponse(request, { ok: false, error: message, details }, 400);
}

function notFound(request) {
  return jsonResponse(request, { ok: false, error: "Not found" }, 404);
}

function isIsoDate(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

async function safeFetchJson(url, init = {}) {
  const res = await fetch(url, init);
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data };
}

/** -------------------- FRED -------------------- **/
async function handleFred(request, env, url) {
  const seriesId = url.searchParams.get("series_id");
  if (!seriesId) return badRequest(request, "Missing series_id");

  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  if (start && !isIsoDate(start)) return badRequest(request, "start must be YYYY-MM-DD");
  if (end && !isIsoDate(end)) return badRequest(request, "end must be YYYY-MM-DD");

  const api = new URL("https://api.stlouisfed.org/fred/series/observations");
  api.searchParams.set("series_id", seriesId);
  api.searchParams.set("api_key", env.FRED_API_KEY);
  api.searchParams.set("file_type", "json");
  if (start) api.searchParams.set("observation_start", start);
  if (end) api.searchParams.set("observation_end", end);

  // pass-through optional parameters
  const passthrough = [
    "frequency",
    "aggregation_method",
    "units",
    "output_type",
    "sort_order",
    "count",
    "offset",
    "limit",
  ];
  for (const p of passthrough) {
    const v = url.searchParams.get(p);
    if (v) api.searchParams.set(p, v);
  }

  const result = await safeFetchJson(api.toString());
  return jsonResponse(request, { ok: true, provider: "FRED", request: { series_id: seriesId, start, end }, result });
}

/** -------------------- BLS -------------------- **/
async function handleBls(request, env) {
  if (request.method !== "POST") {
    return badRequest(request, "BLS requires POST with JSON body");
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest(request, "Invalid JSON body");
  }

  const series = body.series;
  if (!Array.isArray(series) || series.length === 0) {
    return badRequest(request, 'Body must include "series": ["SERIES_ID", ...]');
  }
  if (series.length > 50) {
    return badRequest(request, "Max 50 series per request (BLS limit)");
  }

  const payload = {
    seriesid: series,
    startyear: body.startyear || undefined,
    endyear: body.endyear || undefined,
    registrationKey: env.BLS_API_KEY,
    // optional BLS settings:
    calculations: body.calculations ?? true,
    annualaverage: body.annualaverage ?? false,
    catalog: body.catalog ?? false,
  };

  // Remove undefined keys
  Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);

  const result = await safeFetchJson("https://api.bls.gov/publicAPI/v2/timeseries/data/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  return jsonResponse(request, { ok: true, provider: "BLS", request: { series }, result });
}

/** -------------------- CENSUS -------------------- **/
async function handleCensus(request, env, url) {
  // Generic proxy for Census Data API:
  // Example:
  // /census?dataset=acs/acs5&year=2022&path=/groups/DP03&for=us:1
  // becomes https://api.census.gov/data/2022/acs/acs5/groups/DP03.json?key=...&for=us:1

  const dataset = url.searchParams.get("dataset"); // e.g. "acs/acs5"
  const year = url.searchParams.get("year");       // e.g. "2022"
  const path = url.searchParams.get("path");       // e.g. "/groups/DP03" or "/pums" etc.

  if (!dataset || !year || !path) {
    return badRequest(request, "Missing required params: dataset, year, path");
  }

  const api = new URL(`https://api.census.gov/data/${encodeURIComponent(year)}/${dataset}${path}.json`);
  api.searchParams.set("key", env.CENSUS_API_KEY);

  // pass-through everything except dataset/year/path
  for (const [k, v] of url.searchParams.entries()) {
    if (k === "dataset" || k === "year" || k === "path") continue;
    api.searchParams.set(k, v);
  }

  const result = await safeFetchJson(api.toString());
  return jsonResponse(request, { ok: true, provider: "CENSUS", request: { dataset, year, path }, result });
}

/** -------------------- EIA -------------------- **/
async function handleEia(request, env, url) {
  // EIA v2 supports: https://api.eia.gov/v2/{path}?api_key=...&...
  // You provide:
  // /eia?path=/v2/petroleum/pri/gnd/data&frequency=daily&data[0]=value...
  const path = url.searchParams.get("path");
  if (!path) return badRequest(request, "Missing path (e.g. /v2/petroleum/pri/gnd/data)");

  const api = new URL(`https://api.eia.gov${path}`);
  api.searchParams.set("api_key", env.EIA_API_KEY);

  for (const [k, v] of url.searchParams.entries()) {
    if (k === "path") continue;
    api.searchParams.set(k, v);
  }

  const result = await safeFetchJson(api.toString());
  return jsonResponse(request, { ok: true, provider: "EIA", request: { path }, result });
}

/** -------------------- ALPHAVANTAGE -------------------- **/
async function handleAlphaVantage(request, env, url) {
  // /av?function=TIME_SERIES_DAILY&symbol=SPY
  const api = new URL("https://www.alphavantage.co/query");
  api.searchParams.set("apikey", env.ALPHAVANTAGE_API_KEY);

  // pass-through all params
  for (const [k, v] of url.searchParams.entries()) {
    api.searchParams.set(k, v);
  }

  const result = await safeFetchJson(api.toString());
  return jsonResponse(request, { ok: true, provider: "ALPHAVANTAGE", request: Object.fromEntries(url.searchParams), result });
}

/** -------------------- NEWSAPI -------------------- **/
async function handleNews(request, env, url) {
  // /news?q=housing&language=en -> /v2/everything?...
  // default endpoint: everything
  const endpoint = url.searchParams.get("endpoint") || "everything"; // "top-headlines" or "everything"
  const api = new URL(`https://newsapi.org/v2/${endpoint}`);

  // pass-through params except endpoint
  for (const [k, v] of url.searchParams.entries()) {
    if (k === "endpoint") continue;
    api.searchParams.set(k, v);
  }

  const result = await safeFetchJson(api.toString(), {
    headers: {
      // NewsAPI accepts apiKey query param OR header; header is cleaner
      "X-Api-Key": env.NEWS_API_KEY,
    },
  });

  return jsonResponse(request, { ok: true, provider: "NEWSAPI", request: { endpoint, params: Object.fromEntries(url.searchParams) }, result });
}

/** -------------------- DASHBOARD (sample aggregation) -------------------- **/
async function handleDashboard(request, env) {
  // Minimal “terminal snapshot”:
  // - UNRATE (FRED)
  // - CPIAUCSL (FRED)
  // - DGS10 (FRED)
  // - SPY daily (AlphaVantage)  [note: AV rate-limited; you might swap to stooq later]
  // - News (NewsAPI)
  //
  // You can expand this to construction panels using Census+BLS+EIA.

  const today = new Date();
  const yyyy = today.getUTCFullYear();
  const mm = String(today.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(today.getUTCDate()).padStart(2, "0");
  const end = `${yyyy}-${mm}-${dd}`;

  async function fredLatest(series_id) {
    const api = new URL("https://api.stlouisfed.org/fred/series/observations");
    api.searchParams.set("series_id", series_id);
    api.searchParams.set("api_key", env.FRED_API_KEY);
    api.searchParams.set("file_type", "json");
    api.searchParams.set("sort_order", "desc");
    api.searchParams.set("limit", "1");
    api.searchParams.set("observation_end", end);
    const r = await safeFetchJson(api.toString());
    const obs = r?.data?.observations?.[0];
    return { series_id, observation: obs || null };
  }

  async function avQuote(symbol) {
    const api = new URL("https://www.alphavantage.co/query");
    api.searchParams.set("function", "TIME_SERIES_DAILY");
    api.searchParams.set("symbol", symbol);
    api.searchParams.set("outputsize", "compact");
    api.searchParams.set("apikey", env.ALPHAVANTAGE_API_KEY);
    const r = await safeFetchJson(api.toString());
    // Grab latest bar (keys are dates)
    const ts = r?.data?.["Time Series (Daily)"];
    if (!ts) return { symbol, latest: null, note: "AlphaVantage rate-limit or unexpected response" };
    const dates = Object.keys(ts).sort().reverse();
    const d0 = dates[0];
    return { symbol, date: d0, bar: ts[d0] };
  }

  async function newsHeadlines() {
    const api = new URL("https://newsapi.org/v2/top-headlines");
    api.searchParams.set("q", "economy OR inflation OR housing OR construction");
    api.searchParams.set("language", "en");
    api.searchParams.set("pageSize", "5");
    const r = await safeFetchJson(api.toString(), {
      headers: { "X-Api-Key": env.NEWS_API_KEY },
    });
    const articles = r?.data?.articles?.map((a) => ({
      title: a.title,
      source: a.source?.name,
      publishedAt: a.publishedAt,
      url: a.url,
    })) || [];
    return { articles };
  }

  const [unrate, cpi, dgs10, spy, news] = await Promise.all([
    fredLatest("UNRATE"),
    fredLatest("CPIAUCSL"),
    fredLatest("DGS10"),
    avQuote("SPY"),
    newsHeadlines(),
  ]);

  return jsonResponse(request, {
    ok: true,
    dashboard: {
      asOf: end,
      macro: { unrate, cpi, dgs10 },
      markets: { spy },
      news,
    },
  });
}

/** -------------------- Router -------------------- **/
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Preflight CORS
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: withCors(request) });
    }

    const path = url.pathname.replace(/\/+$/, ""); // trim trailing slash
    try {
      if (path === "" || path === "/") {
        return jsonResponse(request, {
          ok: true,
          name: "Multi-API Worker",
          routes: ["/health", "/fred", "/bls", "/census", "/eia", "/av", "/news", "/dashboard"],
        });
      }
      if (path === "/health") return jsonResponse(request, { ok: true });

      if (path === "/fred") return handleFred(request, env, url);
      if (path === "/bls") return handleBls(request, env);
      if (path === "/census") return handleCensus(request, env, url);
      if (path === "/eia") return handleEia(request, env, url);
      if (path === "/av") return handleAlphaVantage(request, env, url);
      if (path === "/news") return handleNews(request, env, url);
      if (path === "/dashboard") return handleDashboard(request, env);

      return notFound(request);
    } catch (err) {
      return jsonResponse(request, { ok: false, error: "Worker exception", message: String(err?.message || err) }, 500);
    }
  },
};
