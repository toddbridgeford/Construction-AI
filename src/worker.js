const DEFAULT_NOTION_DATABASE_ID = "312f63a1aa6f80af91d7c019f1f2b53d";
const REGISTRY_PROVIDERS = ["FRED", "BLS", "USAspending", "AlphaVantage", "RSS"];
const COMPONENTS = ["Capital", "Pipeline", "Trade", "Materials", "Regulatory", "Macro"];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return corsPreflight();

    try {
      const path = url.pathname.replace(/\/+$/, "") || "/";

      if (path === "/" || path === "/health") {
        return json({ ok: true, service: "construction-ai-terminal" });
      }

      if (path === "/cpi" && request.method === "GET") {
        ensureKv(env);
        const market = mustParam(url, "location");
        const payload = await env.CPI_SNAPSHOTS.get(`cpi:${normalizeMarketKey(market)}`, "json");
        if (!payload) return jsonError(404, "not_found", `No CPI snapshot found for ${market}.`);
        return json(payload, 200, cacheControl(ttl(env)));
      }

      if (path === "/market" && request.method === "GET") {
        ensureKv(env);
        const market = mustParam(url, "location");
        const payload = await env.CPI_SNAPSHOTS.get(`market:${normalizeMarketKey(market)}`, "json");
        if (!payload) return jsonError(404, "not_found", `No market snapshot found for ${market}.`);
        return json(payload, 200, cacheControl(ttl(env)));
      }

      if (path === "/rank/metros" && request.method === "GET") {
        ensureKv(env);
        const payload = await env.CPI_SNAPSHOTS.get("leaderboard:metros", "json");
        if (!payload) return jsonError(404, "not_found", "No leaderboard snapshot available.");
        return json(payload, 200, cacheControl(ttl(env)));
      }

      if (path === "/refresh" && request.method === "GET") {
        ensureKv(env);
        if (!env.ADMIN_TOKEN) throw new HttpError(500, "missing_secret", "Missing required secret: ADMIN_TOKEN");
        const provided = request.headers.get("x-admin-token") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || url.searchParams.get("token");
        if (provided !== env.ADMIN_TOKEN) return jsonError(401, "unauthorized", "Invalid admin token.");

        const targetMarket = url.searchParams.get("location");
        const run = await runSnapshotPipeline(env, ctx, {
          onlyMarket: targetMarket || undefined,
          source: "refresh_endpoint",
        });
        return json({ ok: true, ...run }, 200, { "Cache-Control": "no-store" });
      }

      if (path === "/notion/series" && request.method === "GET") {
        ensureSecrets(env, ["NOTION_TOKEN"]);
        const series = await getSeriesIdsFromNotionCached(env, ctx);
        return json({ count: series.length, series }, 200, cacheControl(ttl(env)));
      }

      if (path === "/notion/add" && request.method === "POST") {
        ensureSecrets(env, ["NOTION_TOKEN"]);
        const body = await safeJsonBody(request);
        if (!body?.properties || typeof body.properties !== "object") {
          return jsonError(400, "invalid_request", "Body must include a Notion 'properties' object.");
        }
        const created = await notionCreatePage(env, body.properties, body.children);
        return json(created);
      }

      if (path === "/fred/observations" && request.method === "GET") {
        ensureSecrets(env, ["FRED_API_KEY"]);
        const seriesId = mustParam(url, "series_id");
        const upstream = new URL("https://api.stlouisfed.org/fred/series/observations");
        upstream.searchParams.set("series_id", seriesId);
        upstream.searchParams.set("api_key", env.FRED_API_KEY);
        upstream.searchParams.set("file_type", "json");

        const passthrough = ["limit", "sort_order", "observation_start", "observation_end", "units", "frequency", "aggregation_method", "output_type", "offset"];
        for (const key of passthrough) {
          const value = url.searchParams.get(key);
          if (value) upstream.searchParams.set(key, value);
        }

        const payload = await fetchJSONWithCache(upstream.toString(), env, ctx);
        return json(payload, 200, cacheControl(ttl(env)));
      }

      if (path === "/bundle" && request.method === "GET") {
        ensureSecrets(env, ["FRED_API_KEY", "NOTION_TOKEN"]);
        const limit = clampInt(url.searchParams.get("limit") ?? "60", 1, 5000);
        const overrideSeries = (url.searchParams.get("fred") ?? "")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean);

        const seriesIds = overrideSeries.length > 0 ? uniqueSorted(overrideSeries) : await getSeriesIdsFromNotionCached(env, ctx);
        const fred = {};

        await mapWithConcurrency(seriesIds, 6, async (seriesId) => {
          const upstream = new URL("https://api.stlouisfed.org/fred/series/observations");
          upstream.searchParams.set("series_id", seriesId);
          upstream.searchParams.set("api_key", env.FRED_API_KEY);
          upstream.searchParams.set("file_type", "json");
          upstream.searchParams.set("limit", String(limit));
          upstream.searchParams.set("sort_order", "desc");
          fred[seriesId] = await fetchJSONWithCache(upstream.toString(), env, ctx);
        });

        return json({
          meta: { used_override: overrideSeries.length > 0, series_count: seriesIds.length },
          fred,
        }, 200, cacheControl(ttl(env)));
      }

      if (path === "/stooq/quote" && request.method === "GET") {
        const symbol = mustParam(url, "s");
        const upstream = new URL("https://stooq.com/q/l/");
        upstream.searchParams.set("s", symbol);
        upstream.searchParams.set("f", "sd2t2ohlcvn");
        upstream.searchParams.set("h", "");
        upstream.searchParams.set("e", "json");

        const payload = await fetchPossiblyJsonWithCache(upstream.toString(), env, ctx);
        return json(payload, 200, cacheControl(ttl(env)));
      }

      if (path === "/bls/timeseries" && request.method === "POST") {
        const body = await safeJsonBody(request);
        if (!Array.isArray(body?.seriesid) || body.seriesid.length === 0) {
          return jsonError(400, "invalid_request", "Body must include non-empty seriesid array.");
        }

        const payload = {
          seriesid: body.seriesid,
          startyear: body.startyear,
          endyear: body.endyear,
          catalog: body.catalog,
          calculations: body.calculations,
          annualaverage: body.annualaverage,
        };
        if (env.BLS_API_KEY) payload.registrationKey = env.BLS_API_KEY;

        const result = await fetchJSONPostWithCache(
          "https://api.bls.gov/publicAPI/v2/timeseries/data/",
          payload,
          env,
          ctx,
        );
        return json(result, 200, cacheControl(ttl(env)));
      }

      if (path === "/usaspending/awards" && request.method === "POST") {
        const body = await safeJsonBody(request);
        const result = await fetchJSONPostWithCache(
          "https://api.usaspending.gov/api/v2/search/spending_by_award/",
          body,
          env,
          ctx,
        );
        return json(result, 200, cacheControl(ttl(env)));
      }

      if (path === "/usaspending/awards/count" && request.method === "POST") {
        const body = await safeJsonBody(request);
        const result = await fetchJSONPostWithCache(
          "https://api.usaspending.gov/api/v2/search/spending_by_award_count/",
          body,
          env,
          ctx,
        );
        return json(result, 200, cacheControl(ttl(env)));
      }

      if (path === "/alphavantage/quote" && request.method === "GET") {
        ensureSecrets(env, ["ALPHAVANTAGE_API_KEY"]);
        const symbol = mustParam(url, "symbol");
        return proxyAlphaVantage(env, ctx, {
          function: "GLOBAL_QUOTE",
          symbol,
        }, false);
      }

      if (path === "/alphavantage/daily" && request.method === "GET") {
        ensureSecrets(env, ["ALPHAVANTAGE_API_KEY"]);
        const symbol = mustParam(url, "symbol");
        const outputsize = allowValue(url.searchParams.get("outputsize") ?? "compact", ["compact", "full"]);
        const datatype = allowValue(url.searchParams.get("datatype") ?? "json", ["json", "csv"]);
        return proxyAlphaVantage(env, ctx, {
          function: "TIME_SERIES_DAILY",
          symbol,
          outputsize,
          datatype,
        }, datatype === "csv");
      }

      if (path === "/alphavantage/intraday" && request.method === "GET") {
        ensureSecrets(env, ["ALPHAVANTAGE_API_KEY"]);
        const symbol = mustParam(url, "symbol");
        const interval = allowValue(url.searchParams.get("interval") ?? "5min", ["1min", "5min", "15min", "30min", "60min"]);
        const outputsize = allowValue(url.searchParams.get("outputsize") ?? "compact", ["compact", "full"]);
        const datatype = allowValue(url.searchParams.get("datatype") ?? "json", ["json", "csv"]);

        const params = {
          function: "TIME_SERIES_INTRADAY",
          symbol,
          interval,
          outputsize,
          datatype,
        };

        const adjusted = url.searchParams.get("adjusted");
        if (adjusted) params.adjusted = allowValue(adjusted, ["true", "false"]);
        const extendedHours = url.searchParams.get("extended_hours");
        if (extendedHours) params.extended_hours = allowValue(extendedHours, ["true", "false"]);
        const month = url.searchParams.get("month");
        if (month) params.month = month;

        return proxyAlphaVantage(env, ctx, params, datatype === "csv");
      }

      if (path === "/alphavantage/news" && request.method === "GET") {
        ensureSecrets(env, ["ALPHAVANTAGE_API_KEY"]);
        const params = { function: "NEWS_SENTIMENT" };
        const safe = ["tickers", "topics", "time_from", "time_to", "limit", "sort"];
        for (const key of safe) {
          const value = url.searchParams.get(key);
          if (value) params[key] = value;
        }
        return proxyAlphaVantage(env, ctx, params, false);
      }

      if (path === "/news/feeds" && request.method === "GET") {
        const mode = allowValue(url.searchParams.get("mode") ?? "fetch", ["list", "fetch"]);
        const feeds = parseCommaList(env.NEWS_FEEDS);
        if (mode === "list") return json({ count: feeds.length, feeds });

        const results = [];
        await mapWithConcurrency(feeds, 4, async (feedUrl) => {
          try {
            const text = await fetchTextWithCache(feedUrl, env, ctx);
            results.push({
              url: feedUrl,
              ok: true,
              status: 200,
              content_type: sniffContentType(text),
              text_truncated: text.slice(0, 4000),
            });
          } catch (error) {
            results.push({
              url: feedUrl,
              ok: false,
              status: 502,
              content_type: null,
              text_truncated: String(error?.message ?? error).slice(0, 4000),
            });
          }
        });

        return json({ count: results.length, results }, 200, cacheControl(ttl(env)));
      }

      return jsonError(404, "not_found", `No route for ${path}`);
    } catch (error) {
      if (error instanceof HttpError) {
        return jsonError(error.status, error.error, error.message, error.headers);
      }
      return jsonError(500, "internal_error", String(error?.message ?? error));
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runSnapshotPipeline(env, ctx, { source: "cron", cron: event.cron }));
  },
};

class HttpError extends Error {
  constructor(status, error, message, headers = {}) {
    super(message);
    this.status = status;
    this.error = error;
    this.headers = headers;
  }
}

async function runSnapshotPipeline(env, ctx, opts = {}) {
  ensureKv(env);
  const registry = await loadMarketRegistry(env, ctx);
  const markets = groupRegistryByMarket(registry);
  const marketNames = Object.keys(markets);
  const generatedAt = new Date().toISOString();
  const summaries = [];

  const filtered = opts.onlyMarket
    ? marketNames.filter((name) => normalizeMarketKey(name) === normalizeMarketKey(opts.onlyMarket))
    : marketNames;

  if (filtered.length === 0) {
    throw new HttpError(404, "not_found", "No markets available for snapshot run.");
  }

  await mapWithConcurrency(filtered, concurrencyLimit(env), async (market) => {
    const entries = markets[market];
    const marketSnapshot = await computeMarketSnapshot(market, entries, env, ctx, generatedAt);
    const key = normalizeMarketKey(market);
    await env.CPI_SNAPSHOTS.put(`market:${key}`, JSON.stringify(marketSnapshot));
    await env.CPI_SNAPSHOTS.put(`cpi:${key}`, JSON.stringify(marketSnapshot.cpi));

    summaries.push({
      market,
      market_key: key,
      headline_cpi: marketSnapshot.cpi.headline_cpi,
      delta_3m: marketSnapshot.cpi.delta_3m,
      zone: marketSnapshot.cpi.zone,
      datapoints: marketSnapshot.meta.total_datapoints,
    });
  });

  const leaderboard = {
    generated_at_utc: generatedAt,
    source: opts.source || "manual",
    cron: opts.cron || null,
    markets: summaries
      .sort((a, b) => (b.headline_cpi - a.headline_cpi) || (b.delta_3m - a.delta_3m))
      .map((item, idx) => ({ rank: idx + 1, ...item })),
  };

  await env.CPI_SNAPSHOTS.put("leaderboard:metros", JSON.stringify(leaderboard));

  return {
    generated_at_utc: generatedAt,
    market_count: filtered.length,
    leaderboard_count: leaderboard.markets.length,
  };
}

async function computeMarketSnapshot(market, registryEntries, env, ctx, generatedAt) {
  const datapoints = [];
  const metricRollups = [];

  await mapWithConcurrency(registryEntries, concurrencyLimit(env), async (entry) => {
    const result = await fetchDatapoint(entry, env, ctx);
    datapoints.push(result);
    if (result.status === "ok") {
      const scored = scoreMetric(entry, result.series);
      if (scored) metricRollups.push(scored);
    }
  });

  const components = {};
  for (const component of COMPONENTS) {
    const subset = metricRollups.filter((row) => row.component === component);
    if (!subset.length) continue;
    const weighted = weightedAverage(subset.map((row) => ({ value: row.score, weight: row.weight })));
    const weightedDelta = weightedAverage(subset.map((row) => ({ value: row.delta_3m, weight: row.weight })));
    components[component] = {
      score: round(weighted),
      delta_3m: round(weightedDelta),
      metrics: subset.map((row) => ({
        metric: row.metric,
        provider: row.provider,
        score: row.score,
        z_score: row.z_score,
        latest_value: row.latest_value,
        delta_3m: row.delta_3m,
        weight: row.weight,
      })),
    };
  }

  const componentRows = Object.entries(components).map(([name, value]) => ({ component: name, ...value }));
  const headline = weightedAverage(componentRows.map((c) => ({ value: c.score, weight: 1 })));
  const delta3m = weightedAverage(componentRows.map((c) => ({ value: c.delta_3m, weight: 1 })));

  const top_contributors = metricRollups
    .map((row) => ({
      metric: row.metric,
      component: row.component,
      contribution: round((row.score - 50) * row.weight),
      delta_3m: row.delta_3m,
    }))
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, 5);

  const overlays = await buildOverlaysForMarket(market, env, ctx);

  const cpi = {
    market,
    generated_at_utc: generatedAt,
    headline_cpi: round(headline),
    zone: zoneForScore(headline),
    delta_3m: round(delta3m),
    components,
    overlays,
    top_contributors,
    timestamp: generatedAt,
  };

  return {
    market,
    market_key: normalizeMarketKey(market),
    generated_at_utc: generatedAt,
    cpi,
    datapoints,
    meta: {
      total_datapoints: registryEntries.length,
      successful_datapoints: datapoints.filter((d) => d.status === "ok").length,
      failed_datapoints: datapoints.filter((d) => d.status !== "ok").length,
    },
  };
}

function scoreMetric(entry, values) {
  const transformed = applyTransform(values, entry.transform);
  if (transformed.length < 18) return null;

  const window = transformed.slice(-36);
  const latest = transformed.at(-1);
  const lag = transformed.at(-4) ?? transformed[0];
  if (!latest || !Number.isFinite(lag.value)) return null;

  const z = zScore(window.map((x) => x.value), latest.value);
  if (!Number.isFinite(z)) return null;

  return {
    provider: entry.provider,
    metric: entry.metric,
    component: entry.component,
    weight: sanitizeWeight(entry.weight),
    latest_value: round(latest.value),
    delta_3m: round(latest.value - lag.value),
    z_score: round(z),
    score: round(clamp(50 + 50 * Math.tanh(z / 2), 0, 100)),
  };
}

function applyTransform(points, transform) {
  const clean = points.filter((p) => Number.isFinite(p.value)).sort((a, b) => a.date.localeCompare(b.date));
  if (!clean.length) return [];
  if (transform === "level") return clean;

  const lag = transform === "yoy" ? 12 : 1;
  const out = [];
  for (let i = lag; i < clean.length; i += 1) {
    const prev = clean[i - lag]?.value;
    const curr = clean[i]?.value;
    if (!Number.isFinite(prev) || !Number.isFinite(curr) || prev === 0) continue;
    out.push({ date: clean[i].date, value: ((curr - prev) / Math.abs(prev)) * 100 });
  }
  return out;
}

function zoneForScore(score) {
  if (score <= 39) return "Stress";
  if (score <= 59) return "Slowdown";
  if (score <= 74) return "Watch";
  return "Expansion";
}

async function loadMarketRegistry(env, ctx) {
  const fromNotion = await tryLoadRegistryFromNotion(env, ctx);
  if (fromNotion.length > 0) return fromNotion;
  return loadRegistryFromEnv(env);
}

async function tryLoadRegistryFromNotion(env, ctx) {
  if (!env.NOTION_TOKEN) return [];
  const dbId = env.MARKET_REGISTRY_NOTION_DATABASE_ID || env.NOTION_DATABASE_ID || DEFAULT_NOTION_DATABASE_ID;
  if (!dbId) return [];

  const cacheKey = `https://cache.local/market-registry/${dbId}`;
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) {
    const payload = await cached.json();
    if (Array.isArray(payload)) return payload;
  }

  try {
    let startCursor;
    const rows = [];

    while (true) {
      const body = {
        page_size: 100,
        filter: { property: "Active", checkbox: { equals: true } },
        ...(startCursor ? { start_cursor: startCursor } : {}),
      };

      const response = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
        method: "POST",
        headers: notionHeaders(env),
        body: JSON.stringify(body),
      });

      const text = await response.text();
      if (!response.ok) throw new Error(`Notion registry query failed (${response.status}) ${text.slice(0, 150)}`);
      const data = safeParseJson(text);

      for (const row of data?.results || []) {
        const mapped = notionRegistryRow(row);
        if (mapped) rows.push(mapped);
      }

      if (data?.has_more && data?.next_cursor) {
        startCursor = data.next_cursor;
        continue;
      }
      break;
    }

    const toCache = new Response(JSON.stringify(rows), {
      headers: { "Content-Type": "application/json", ...cacheControl(ttl(env)) },
    });
    ctx.waitUntil(cache.put(cacheKey, toCache));
    return rows;
  } catch {
    return [];
  }
}

function notionRegistryRow(row) {
  const market = readNotionText(row?.properties?.Market);
  const provider = readNotionText(row?.properties?.Provider);
  const key = readNotionText(row?.properties?.Key);
  const metric = readNotionText(row?.properties?.Metric);
  const component = readNotionText(row?.properties?.Component);
  const transform = readNotionText(row?.properties?.Transform) || "level";
  const weight = Number(readNotionNumber(row?.properties?.Weight) ?? 1);
  const active = readNotionCheckbox(row?.properties?.Active);

  if (!market || !provider || !key || !metric || !component || !active) return null;
  if (!REGISTRY_PROVIDERS.includes(provider)) return null;
  return {
    market,
    provider,
    key,
    metric,
    component,
    transform: ["level", "pct_change", "yoy"].includes(transform) ? transform : "level",
    weight: sanitizeWeight(weight),
    active: true,
  };
}

function loadRegistryFromEnv(env) {
  if (!env.MARKET_REGISTRY_JSON) throw new HttpError(500, "missing_registry", "Notion registry unavailable and MARKET_REGISTRY_JSON is not set.");
  let parsed;
  try {
    parsed = JSON.parse(env.MARKET_REGISTRY_JSON);
  } catch {
    throw new HttpError(500, "invalid_registry", "MARKET_REGISTRY_JSON must be valid JSON.");
  }

  if (!Array.isArray(parsed)) throw new HttpError(500, "invalid_registry", "MARKET_REGISTRY_JSON must be a JSON array.");

  return parsed
    .map((row) => ({
      market: String(row.market || row.Market || "").trim(),
      provider: String(row.provider || row.Provider || "").trim(),
      key: String(row.key || row.Key || "").trim(),
      metric: String(row.metric || row.Metric || "").trim(),
      component: String(row.component || row.Component || "").trim(),
      transform: String(row.transform || row.Transform || "level").trim(),
      weight: sanitizeWeight(Number(row.weight ?? row.Weight ?? 1)),
      active: row.active ?? row.Active ?? true,
    }))
    .filter((row) => row.active && row.market && row.provider && row.key && row.metric && row.component)
    .filter((row) => REGISTRY_PROVIDERS.includes(row.provider))
    .map((row) => ({ ...row, transform: ["level", "pct_change", "yoy"].includes(row.transform) ? row.transform : "level" }));
}

function groupRegistryByMarket(rows) {
  const grouped = {};
  for (const row of rows) {
    if (!grouped[row.market]) grouped[row.market] = [];
    grouped[row.market].push(row);
  }
  return grouped;
}

async function fetchDatapoint(entry, env, ctx) {
  try {
    const provider = entry.provider;
    if (provider === "FRED") return fetchFredMetric(entry, env, ctx);
    if (provider === "BLS") return fetchBlsMetric(entry, env, ctx);
    if (provider === "USAspending") return fetchUsaspendingMetric(entry, env, ctx);
    if (provider === "AlphaVantage") return fetchAlphaMetric(entry, env, ctx);
    if (provider === "RSS") return fetchRssMetric(entry, env, ctx);
    return { ...entry, status: "provider_unavailable", message: `Unsupported provider ${provider}` };
  } catch (error) {
    return { ...entry, status: "provider_unavailable", message: String(error?.message ?? error), series: [] };
  }
}

async function fetchFredMetric(entry, env, ctx) {
  if (!env.FRED_API_KEY) return { ...entry, status: "provider_unavailable", message: "Missing FRED_API_KEY", series: [] };
  const upstream = new URL("https://api.stlouisfed.org/fred/series/observations");
  upstream.searchParams.set("series_id", entry.key);
  upstream.searchParams.set("api_key", env.FRED_API_KEY);
  upstream.searchParams.set("file_type", "json");
  upstream.searchParams.set("sort_order", "asc");
  upstream.searchParams.set("limit", "120");
  const payload = await fetchJSONWithCache(upstream.toString(), env, ctx);
  const series = (payload?.observations || [])
    .map((o) => ({ date: o.date, value: parseNumeric(o.value) }))
    .filter((o) => Number.isFinite(o.value));
  return { ...entry, status: "ok", source: "fred", series, latest_observation_date: series.at(-1)?.date || null };
}

async function fetchBlsMetric(entry, env, ctx) {
  const year = new Date().getUTCFullYear();
  const payload = { seriesid: [entry.key], startyear: String(year - 10), endyear: String(year) };
  if (env.BLS_API_KEY) payload.registrationKey = env.BLS_API_KEY;
  const result = await fetchJSONPostWithCache("https://api.bls.gov/publicAPI/v2/timeseries/data/", payload, env, ctx);
  const datapoints = result?.Results?.series?.[0]?.data || [];
  const series = datapoints
    .map((d) => ({ date: `${d.year}-${String(monthFromBlsPeriod(d.period)).padStart(2, "0")}-01`, value: parseNumeric(d.value) }))
    .filter((d) => Number.isFinite(d.value) && d.date.includes("-"))
    .sort((a, b) => a.date.localeCompare(b.date));
  return { ...entry, status: "ok", source: "bls", series, latest_observation_date: series.at(-1)?.date || null };
}

async function fetchUsaspendingMetric(entry, env, ctx) {
  const templates = safeParseJson(env.USASPENDING_QUERY_TEMPLATES_JSON || "{}");
  const template = templates?.[entry.key] || safeParseJson(entry.key);
  if (!template || typeof template !== "object") return { ...entry, status: "provider_unavailable", message: `Missing USAspending template for key ${entry.key}`, series: [] };

  const response = await fetchJSONPostWithCache("https://api.usaspending.gov/api/v2/search/spending_by_award/", template, env, ctx);
  const total = Number(response?.page_metadata?.total || 0);
  const date = new Date().toISOString().slice(0, 10);
  return { ...entry, status: "ok", source: "usaspending", series: [{ date, value: total }], latest_observation_date: date };
}

async function fetchAlphaMetric(entry, env, ctx) {
  if (!env.ALPHAVANTAGE_API_KEY) return { ...entry, status: "provider_unavailable", message: "Missing ALPHAVANTAGE_API_KEY", series: [] };
  const parsed = parseAlphaKey(entry.key);
  const upstream = new URL("https://www.alphavantage.co/query");
  for (const [k, v] of Object.entries(parsed)) upstream.searchParams.set(k, v);
  upstream.searchParams.set("apikey", env.ALPHAVANTAGE_API_KEY);
  const payload = await fetchJSONWithCache(upstream.toString(), env, ctx, alphaTtl(env));

  if (payload?.Note || payload?.["Error Message"]) {
    return { ...entry, status: "provider_unavailable", message: "Alpha Vantage throttled", series: [] };
  }

  const tseries = payload["Time Series (Daily)"] || payload["Time Series (5min)"] || payload["Weekly Time Series"] || null;
  if (!tseries || typeof tseries !== "object") {
    const q = Number(payload?.["Global Quote"]?.["05. price"]);
    const date = new Date().toISOString().slice(0, 10);
    return { ...entry, status: Number.isFinite(q) ? "ok" : "provider_unavailable", source: "alphavantage", series: Number.isFinite(q) ? [{ date, value: q }] : [] };
  }

  const series = Object.entries(tseries)
    .map(([date, obj]) => ({ date, value: parseNumeric(obj?.["4. close"] || obj?.["1. open"] || Object.values(obj || {})[0]) }))
    .filter((row) => Number.isFinite(row.value))
    .sort((a, b) => a.date.localeCompare(b.date));

  return { ...entry, status: "ok", source: "alphavantage", series, latest_observation_date: series.at(-1)?.date || null };
}

async function fetchRssMetric(entry, env, ctx) {
  const url = entry.key.startsWith("http") ? entry.key : parseCommaList(env.NEWS_FEEDS).find((f) => f.includes(entry.key));
  if (!url) return { ...entry, status: "provider_unavailable", message: `Unable to resolve RSS key ${entry.key}`, series: [] };
  const text = await fetchTextWithCache(url, env, ctx);
  const count = (text.match(/<item\b|<entry\b/g) || []).length;
  const date = new Date().toISOString().slice(0, 10);
  return { ...entry, status: "ok", source: "rss", series: [{ date, value: count }], latest_observation_date: date };
}

async function buildOverlaysForMarket(market, env, ctx) {
  const overlays = {
    disclaimer: "Temporary overlay signals for context only. Do not treat overlays as causal drivers.",
    market,
  };

  if (env.ALPHAVANTAGE_API_KEY && env.OVERLAY_STOCK_SYMBOL) {
    const stock = await fetchAlphaMetric({ key: `TIME_SERIES_DAILY:${env.OVERLAY_STOCK_SYMBOL}` }, env, ctx);
    overlays.stock = {
      symbol: env.OVERLAY_STOCK_SYMBOL,
      latest: stock.series?.at(-1)?.value ?? null,
      status: stock.status,
      temporary: true,
    };
  }

  const feeds = parseCommaList(env.NEWS_FEEDS);
  overlays.news = { feed_count: feeds.length, temporary: true };
  overlays.energy = { note: "Energy overlay placeholder; configure a market registry metric for energy series.", temporary: true };
  return overlays;
}

function parseAlphaKey(key) {
  if (key.trim().startsWith("{")) {
    const parsed = safeParseJson(key);
    if (parsed && typeof parsed === "object") return parsed;
  }
  const [fn, symbol] = key.split(":");
  return { function: fn || "GLOBAL_QUOTE", symbol: symbol || key };
}

function readNotionText(prop) {
  if (!prop) return "";
  if (prop.type === "title") return (prop.title || []).map((x) => x.plain_text).join("").trim();
  if (prop.type === "rich_text") return (prop.rich_text || []).map((x) => x.plain_text).join("").trim();
  if (prop.type === "select") return prop.select?.name?.trim() || "";
  return "";
}

function readNotionCheckbox(prop) {
  return Boolean(prop?.checkbox);
}

function readNotionNumber(prop) {
  if (prop?.type !== "number") return null;
  return prop.number;
}

function monthFromBlsPeriod(period) {
  if (!period || typeof period !== "string") return 1;
  if (!period.startsWith("M")) return 1;
  const num = Number(period.slice(1));
  return Number.isFinite(num) && num >= 1 && num <= 12 ? num : 1;
}

function parseNumeric(value) {
  if (value === null || value === undefined || value === ".") return NaN;
  const num = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(num) ? num : NaN;
}

function weightedAverage(items) {
  let num = 0;
  let den = 0;
  for (const item of items) {
    if (!Number.isFinite(item.value) || !Number.isFinite(item.weight) || item.weight <= 0) continue;
    num += item.value * item.weight;
    den += item.weight;
  }
  return den > 0 ? num / den : 50;
}

function zScore(window, value) {
  if (!Array.isArray(window) || window.length < 18 || !Number.isFinite(value)) return NaN;
  const mean = window.reduce((acc, x) => acc + x, 0) / window.length;
  const variance = window.reduce((acc, x) => acc + (x - mean) ** 2, 0) / window.length;
  const std = Math.sqrt(variance);
  if (!Number.isFinite(std) || std === 0) return 0;
  return (value - mean) / std;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function round(v, digits = 2) {
  if (!Number.isFinite(v)) return null;
  const pow = 10 ** digits;
  return Math.round(v * pow) / pow;
}

function sanitizeWeight(value) {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function normalizeMarketKey(market) {
  return String(market || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function concurrencyLimit(env) {
  const n = Number(env.SNAPSHOT_CONCURRENCY ?? 10);
  if (!Number.isFinite(n)) return 10;
  return clampInt(String(n), 1, 12);
}

function ensureKv(env) {
  if (!env.CPI_SNAPSHOTS || typeof env.CPI_SNAPSHOTS.get !== "function") {
    throw new HttpError(500, "missing_binding", "Missing KV binding: CPI_SNAPSHOTS");
  }
}

function json(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(),
      ...extraHeaders,
    },
  });
}

function jsonError(status, error, message, headers = {}) {
  return json({ error, message }, status, headers);
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-admin-token",
  };
}

function corsPreflight() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

function mustParam(url, key) {
  const value = url.searchParams.get(key);
  if (!value) throw new HttpError(400, "invalid_request", `Missing required query parameter '${key}'.`);
  return value;
}

function clampInt(value, min, max) {
  const n = Number.parseInt(String(value), 10);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function ttl(env) {
  const value = Number(env.CACHE_TTL_SECONDS ?? 300);
  if (!Number.isFinite(value)) return 300;
  return Math.max(1, Math.min(3600, Math.trunc(value)));
}

function cacheControl(seconds) {
  return { "Cache-Control": `public, max-age=${seconds}` };
}

function notionDatabaseId(env) {
  return env.NOTION_DATABASE_ID || DEFAULT_NOTION_DATABASE_ID;
}

function ensureSecrets(env, names) {
  for (const name of names) {
    if (!env[name]) throw new HttpError(500, "missing_secret", `Missing required secret: ${name}`);
  }
}

function allowValue(value, allowed) {
  if (allowed.includes(value)) return value;
  throw new HttpError(400, "invalid_request", `Invalid value '${value}'. Allowed: ${allowed.join(", ")}`);
}

function parseCommaList(input) {
  return String(input || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

async function safeJsonBody(request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must be valid JSON.");
  }
}

async function getSeriesIdsFromNotionCached(env, ctx) {
  const cacheKey = "https://cache.local/notion-series";
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached.json();

  const series = await getSeriesIdsFromNotion(env);
  const response = new Response(JSON.stringify(series), {
    headers: {
      "Content-Type": "application/json",
      ...cacheControl(ttl(env)),
    },
  });
  ctx.waitUntil(cache.put(cacheKey, response));
  return series;
}

async function getSeriesIdsFromNotion(env) {
  const dbId = notionDatabaseId(env);
  const seriesSet = new Set();
  let startCursor;

  while (true) {
    const payload = {
      page_size: 100,
      filter: {
        property: "Series ID",
        select: { is_not_empty: true },
      },
      ...(startCursor ? { start_cursor: startCursor } : {}),
    };

    const response = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: "POST",
      headers: notionHeaders(env),
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    if (!response.ok) {
      throw new HttpError(502, "upstream_error", `Notion query failed (${response.status}): ${text.slice(0, 300)}`);
    }

    const data = safeParseJson(text);
    for (const row of data?.results || []) {
      const selected = row?.properties?.["Series ID"]?.select?.name;
      if (selected && typeof selected === "string") seriesSet.add(selected.trim());
    }

    if (data?.has_more && data?.next_cursor) {
      startCursor = data.next_cursor;
      continue;
    }
    break;
  }

  return uniqueSorted([...seriesSet]);
}

async function notionCreatePage(env, properties, children) {
  const body = {
    parent: { database_id: notionDatabaseId(env) },
    properties,
  };
  if (Array.isArray(children)) body.children = children;

  const response = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: notionHeaders(env),
    body: JSON.stringify(body),
  });

  const text = await response.text();
  const parsed = safeParseJson(text);
  if (!response.ok) {
    throw new HttpError(502, "upstream_error", `Notion page create failed (${response.status}): ${text.slice(0, 300)}`);
  }
  return parsed;
}

function notionHeaders(env) {
  return {
    Authorization: `Bearer ${env.NOTION_TOKEN}`,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
  };
}

async function fetchJSONWithCache(url, env, ctx, ttlSeconds = ttl(env)) {
  const cacheKey = new Request(url, { method: "GET" });
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached.json();

  const response = await fetch(url);
  const text = await response.text();
  if (!response.ok) {
    throw new HttpError(502, "upstream_error", `Upstream GET failed (${response.status}): ${text.slice(0, 300)}`);
  }

  const parsed = safeParseJson(text);
  const toCache = new Response(JSON.stringify(parsed), {
    headers: { "Content-Type": "application/json", ...cacheControl(ttlSeconds) },
  });
  ctx.waitUntil(cache.put(cacheKey, toCache));
  return parsed;
}

async function fetchPossiblyJsonWithCache(url, env, ctx) {
  const cacheKey = new Request(url, { method: "GET" });
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached.json();

  const response = await fetch(url);
  const text = await response.text();
  if (!response.ok) {
    throw new HttpError(502, "upstream_error", `Upstream GET failed (${response.status}): ${text.slice(0, 300)}`);
  }

  const parsed = safeParseJson(text);
  const toCache = new Response(JSON.stringify(parsed), {
    headers: { "Content-Type": "application/json", ...cacheControl(ttl(env)) },
  });
  ctx.waitUntil(cache.put(cacheKey, toCache));
  return parsed;
}

async function fetchJSONPostWithCache(url, body, env, ctx) {
  const stable = stableStringify(body ?? {});
  const hash = await sha256(stable);
  const cacheKey = new Request(`https://cache.local/post/${hash}?u=${encodeURIComponent(url)}`, { method: "GET" });
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached.json();

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: stable,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new HttpError(502, "upstream_error", `Upstream POST failed (${response.status}): ${text.slice(0, 300)}`);
  }

  const parsed = safeParseJson(text);
  const toCache = new Response(JSON.stringify(parsed), {
    headers: { "Content-Type": "application/json", ...cacheControl(ttl(env)) },
  });
  ctx.waitUntil(cache.put(cacheKey, toCache));
  return parsed;
}

async function fetchTextWithCache(url, env, ctx) {
  const cacheKey = new Request(url, { method: "GET" });
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached.text();

  const response = await fetch(url);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Feed fetch failed (${response.status})`);
  }

  const toCache = new Response(text, {
    headers: { "Content-Type": response.headers.get("content-type") || "text/plain", ...cacheControl(ttl(env)) },
  });
  ctx.waitUntil(cache.put(cacheKey, toCache));
  return text;
}

async function proxyAlphaVantage(env, ctx, params, wantsCsv) {
  const upstream = new URL("https://www.alphavantage.co/query");
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) upstream.searchParams.set(key, String(value));
  }
  upstream.searchParams.set("apikey", env.ALPHAVANTAGE_API_KEY);

  const cache = caches.default;
  const cacheKey = new Request(upstream.toString(), { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const response = await fetch(upstream.toString());
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();

  if (!response.ok) {
    return jsonError(502, "upstream_error", `Alpha Vantage error (${response.status})`);
  }

  if (!wantsCsv || contentType.includes("json") || text.trim().startsWith("{")) {
    const parsed = safeParseJson(text);
    if (parsed?.Note || parsed?.["Error Message"]) {
      return json(
        { warning: "Alpha Vantage rate limited or returned an error.", upstream: parsed },
        429,
        { "Cache-Control": "no-store" },
      );
    }

    const toCache = new Response(JSON.stringify(parsed), {
      headers: { "Content-Type": "application/json", ...cacheControl(alphaTtl(env)) },
    });
    ctx.waitUntil(cache.put(cacheKey, toCache));
    return toCache;
  }

  const toCache = new Response(text, {
    headers: { "Content-Type": "text/csv; charset=utf-8", ...cacheControl(alphaTtl(env)) },
  });
  ctx.waitUntil(cache.put(cacheKey, toCache));
  return toCache;
}

function alphaTtl(env) {
  return Math.max(ttl(env), 900);
}

function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function sniffContentType(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith("<?xml") || trimmed.includes("<rss") || trimmed.includes("<feed")) return "application/xml";
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return "application/json";
  return "text/plain";
}

async function sha256(input) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const queue = [...items];
  const workers = new Array(Math.min(concurrency, queue.length)).fill(0).map(async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item !== undefined) await mapper(item);
    }
  });
  await Promise.all(workers);
}
