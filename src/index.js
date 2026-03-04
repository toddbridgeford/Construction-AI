export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return corsPreflight();

    try {
      if (url.pathname === "/" || url.pathname === "/health") {
        return json({ ok: true, service: "fred-stooq-notion-worker" });
      }

      // Debug endpoint: see what series ids Notion currently returns
      if (url.pathname === "/notion/series") {
        const series = await getSeriesIdsFromNotionCached(env, ctx);
        return json({ count: series.length, series });
      }

      // Your dashboard endpoint: pulls all Notion series by default
      if (url.pathname === "/bundle") {
        const limit = clampInt(url.searchParams.get("limit") ?? "60", 1, 5000);

        // Allow overrides if you want
        const fredOverride = (url.searchParams.get("fred") ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);

        const seriesIds = fredOverride.length
          ? fredOverride
          : await getSeriesIdsFromNotionCached(env, ctx);

        const out = {
          fred: {},
          meta: { used_override: fredOverride.length > 0, series_count: seriesIds.length },
        };

        await Promise.all(
          seriesIds.map(async (series_id) => {
            const upstream = new URL("https://api.stlouisfed.org/fred/series/observations");
            upstream.searchParams.set("series_id", series_id);
            upstream.searchParams.set("api_key", env.FRED_API_KEY);
            upstream.searchParams.set("file_type", "json");
            upstream.searchParams.set("limit", String(limit));
            upstream.searchParams.set("sort_order", "desc");
            out.fred[series_id] = await fetchJSONWithCache(upstream.toString(), env, ctx);
          }),
        );

        return json(out, 200, { "Cache-Control": `public, max-age=${ttl(env)}` });
      }

      return json({ error: "Not found", path: url.pathname }, 404);
    } catch (err) {
      return json({ error: "Bad request", message: String(err?.message ?? err) }, 400);
    }
  },
};

// ---------------- Notion series extraction ----------------

async function getSeriesIdsFromNotionCached(env, ctx) {
  // Cache the extracted series list at the edge so /bundle is fast
  const cache = caches.default;
  const key = new Request("https://cache.local/notion-series", { method: "GET" });

  const cached = await cache.match(key);
  if (cached) return cached.json();

  const series = await getSeriesIdsFromNotion(env);

  const toCache = new Response(JSON.stringify(series), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${ttl(env)}`,
    },
  });
  ctx.waitUntil(cache.put(key, toCache));
  return series;
}

async function getSeriesIdsFromNotion(env) {
  if (!env.NOTION_TOKEN) throw new Error("Missing NOTION_TOKEN secret");
  if (!env.NOTION_DATABASE_ID) throw new Error("Missing NOTION_DATABASE_ID var");

  // We query the database and pull the "Series ID" property from each page.
  // Pagination supported via start_cursor.
  const seriesSet = new Set();
  let start_cursor = undefined;

  while (true) {
    const body = {
      page_size: 100,
      ...(start_cursor ? { start_cursor } : {}),
      // Optional: only include rows where Series ID is not empty
      filter: {
        property: "Series ID",
        select: { is_not_empty: true },
      },
    };

    const res = await fetch(`https://api.notion.com/v1/databases/${env.NOTION_DATABASE_ID}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.NOTION_TOKEN}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Notion query failed (${res.status}): ${text.slice(0, 300)}`);
    }

    const data = await res.json();

    for (const page of data.results ?? []) {
      const prop = page?.properties?.["Series ID"];
      const selected = prop?.select?.name;

      // Your DB uses a Select for Series ID (based on the schema you shared)
      if (selected && typeof selected === "string") {
        seriesSet.add(selected.trim());
      }
    }

    if (data.has_more && data.next_cursor) {
      start_cursor = data.next_cursor;
      continue;
    }
    break;
  }

  // Return stable ordering
  return Array.from(seriesSet).sort((a, b) => a.localeCompare(b));
}

// ---------------- caching + common helpers ----------------

function ttl(env) {
  const v = Number(env.CACHE_TTL_SECONDS ?? 300);
  return Number.isFinite(v) ? Math.max(0, Math.min(3600, v)) : 300;
}

function corsHeaders(extra = {}) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
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

function clampInt(value, min, max) {
  const n = parseInt(String(value), 10);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

async function fetchJSONWithCache(upstreamUrl, env, ctx) {
  const cache = caches.default;
  const cacheKey = new Request(upstreamUrl, { method: "GET" });

  const cached = await cache.match(cacheKey);
  if (cached) return cached.json();

  const res = await fetch(upstreamUrl, {
    headers: { "User-Agent": "cf-worker-fred-notion", Accept: "application/json" },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`FRED upstream error (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const toCache = new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${ttl(env)}` },
  });
  ctx.waitUntil(cache.put(cacheKey, toCache));
  return data;
}
