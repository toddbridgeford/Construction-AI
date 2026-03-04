export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // ---- CORS ----
    if (request.method === "OPTIONS") return corsPreflight(request);

    try {
      // Simple router
      if (url.pathname === "/" || url.pathname === "/health") {
        return json({ ok: true, service: "fred-stooq-worker" }, 200);
      }

      if (url.pathname === "/fred/observations") {
        // /fred/observations?series_id=GDP&limit=12&sort_order=desc
        const series_id = mustParam(url, "series_id");
        const limit = clampInt(url.searchParams.get("limit") ?? "100", 1, 5000);
        const sort_order = (url.searchParams.get("sort_order") ?? "desc").toLowerCase();
        const observation_start = url.searchParams.get("observation_start"); // YYYY-MM-DD optional
        const observation_end = url.searchParams.get("observation_end");     // YYYY-MM-DD optional

        const upstream = new URL("https://api.stlouisfed.org/fred/series/observations");
        upstream.searchParams.set("series_id", series_id);
        upstream.searchParams.set("api_key", env.FRED_API_KEY);
        upstream.searchParams.set("file_type", "json");
        upstream.searchParams.set("limit", String(limit));
        upstream.searchParams.set("sort_order", sort_order === "asc" ? "asc" : "desc");
        if (observation_start) upstream.searchParams.set("observation_start", observation_start);
        if (observation_end) upstream.searchParams.set("observation_end", observation_end);

        return cachedFetchJSON(request, upstream.toString(), env, ctx);
      }

      if (url.pathname === "/fred/series") {
        // /fred/series?series_id=GDP  (metadata)
        const series_id = mustParam(url, "series_id");

        const upstream = new URL("https://api.stlouisfed.org/fred/series");
        upstream.searchParams.set("series_id", series_id);
        upstream.searchParams.set("api_key", env.FRED_API_KEY);
        upstream.searchParams.set("file_type", "json");

        return cachedFetchJSON(request, upstream.toString(), env, ctx);
      }

      if (url.pathname === "/stooq/quote") {
        // /stooq/quote?s=aapl.us
        // Returns latest quote fields from stooq "q/l" JSON feed.
        const s = mustParam(url, "s").toLowerCase();

        // Stooq JSON quote endpoint
        // docs are informal; this is widely used:
        // https://stooq.com/q/l/?s=aapl.us&f=sd2t2ohlcv&h&e=json
        const upstream = new URL("https://stooq.com/q/l/");
        upstream.searchParams.set("s", s);
        upstream.searchParams.set("f", "sd2t2ohlcvn"); // symbol,date,time,open,high,low,close,volume,name
        upstream.searchParams.set("h", "");
        upstream.searchParams.set("e", "json");

        // Stooq sometimes returns text/json but not perfect headers; we still parse JSON.
        return cachedFetchStooqJSON(request, upstream.toString(), env, ctx);
      }

      if (url.pathname === "/bundle") {
        // Convenience endpoint for dashboards / Custom GPT Actions
        // /bundle?fred=GDP,CPIAUCSL&stooq=spy.us,qqq.us
        const fred = (url.searchParams.get("fred") ?? "")
          .split(",")
          .map(s => s.trim())
          .filter(Boolean);

        const stooq = (url.searchParams.get("stooq") ?? "")
          .split(",")
          .map(s => s.trim().toLowerCase())
          .filter(Boolean);

        const limit = clampInt(url.searchParams.get("limit") ?? "60", 1, 5000);

        const out = { fred: {}, stooq: {} };

        // FRED: pull observations for each series
        await Promise.all(
          fred.map(async (series_id) => {
            const upstream = new URL("https://api.stlouisfed.org/fred/series/observations");
            upstream.searchParams.set("series_id", series_id);
            upstream.searchParams.set("api_key", env.FRED_API_KEY);
            upstream.searchParams.set("file_type", "json");
            upstream.searchParams.set("limit", String(limit));
            upstream.searchParams.set("sort_order", "desc");
            out.fred[series_id] = await fetchJSONWithCache(request, upstream.toString(), env, ctx);
          })
        );

        // Stooq: pull quotes
        await Promise.all(
          stooq.map(async (sym) => {
            const upstream = new URL("https://stooq.com/q/l/");
            upstream.searchParams.set("s", sym);
            upstream.searchParams.set("f", "sd2t2ohlcvn");
            upstream.searchParams.set("h", "");
            upstream.searchParams.set("e", "json");
            out.stooq[sym] = await fetchStooqJSONWithCache(request, upstream.toString(), env, ctx);
          })
        );

        return json(out, 200, { "Cache-Control": `public, max-age=${ttl(env)}` });
      }

      return json({ error: "Not found", path: url.pathname }, 404);
    } catch (err) {
      return json({ error: "Bad request", message: String(err?.message ?? err) }, 400);
    }
  },
};

// ---------------- helpers ----------------

function ttl(env) {
  // seconds
  const v = Number(env.CACHE_TTL_SECONDS ?? 60);
  return Number.isFinite(v) ? Math.max(0, Math.min(3600, v)) : 60;
}

function corsHeaders(extra = {}) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    ...extra,
  };
}

function corsPreflight() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

function json(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: corsHeaders({ "Content-Type": "application/json; charset=utf-8", ...extraHeaders }),
  });
}

function mustParam(url, key) {
  const v = url.searchParams.get(key);
  if (!v) throw new Error(`Missing required query param: ${key}`);
  return v;
}

function clampInt(value, min, max) {
  const n = parseInt(String(value), 10);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

async function cachedFetchJSON(request, upstreamUrl, env, ctx) {
  const data = await fetchJSONWithCache(request, upstreamUrl, env, ctx);
  return json(data, 200, { "Cache-Control": `public, max-age=${ttl(env)}` });
}

async function cachedFetchStooqJSON(request, upstreamUrl, env, ctx) {
  const data = await fetchStooqJSONWithCache(request, upstreamUrl, env, ctx);
  return json(data, 200, { "Cache-Control": `public, max-age=${ttl(env)}` });
}

async function fetchJSONWithCache(request, upstreamUrl, env, ctx) {
  const cache = caches.default;
  const cacheKey = new Request(upstreamUrl, { method: "GET" });

  const cached = await cache.match(cacheKey);
  if (cached) return cached.json();

  const res = await fetch(upstreamUrl, {
    headers: {
      "User-Agent": "cf-worker-fred-stooq",
      "Accept": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Upstream error (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  // Store response in cache
  const toCache = new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${ttl(env)}` },
  });
  ctx.waitUntil(cache.put(cacheKey, toCache));
  return data;
}

async function fetchStooqJSONWithCache(request, upstreamUrl, env, ctx) {
  const cache = caches.default;
  const cacheKey = new Request(upstreamUrl, { method: "GET" });

  const cached = await cache.match(cacheKey);
  if (cached) return cached.json();

  const res = await fetch(upstreamUrl, {
    headers: {
      "User-Agent": "cf-worker-fred-stooq",
      "Accept": "application/json, text/plain;q=0.9, */*;q=0.8",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Stooq upstream error (${res.status}): ${text.slice(0, 300)}`);
  }

  // Stooq sometimes returns with odd content-type; parse explicitly.
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Stooq returned non-JSON: ${text.slice(0, 300)}`);
  }

  const toCache = new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${ttl(env)}` },
  });
  ctx.waitUntil(cache.put(cacheKey, toCache));
  return data;
}
