export interface Env {
  DASHBOARD_KV: KVNamespace;
  REFRESH_TOKEN?: string;

  // Optional API keys (safe if missing; pipeline will degrade gracefully)
  NEWSAPI_KEY?: string;
  ALPHAVANTAGE_API_KEY?: string;
}

type Dashboard = {
  generated_at: string;
  tickers: { symbol: string; price: number; change: number; changePct: number }[];
  news: { title: string; source: string; url: string; publishedAt: string; summary?: string }[];
  construction: { title: string; value: string; source: string }[];
  signals: { name: string; value: string; direction: "up" | "down" | "flat" }[];
};

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,x-refresh-token",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS_HEADERS },
  });
}

async function readLatest(env: Env): Promise<Dashboard | null> {
  const raw = await env.DASHBOARD_KV.get("dashboard_latest");
  return raw ? (JSON.parse(raw) as Dashboard) : null;
}

async function writeLatest(env: Env, payload: Dashboard): Promise<void> {
  const ts = new Date(payload.generated_at).getTime();
  // latest
  await env.DASHBOARD_KV.put("dashboard_latest", JSON.stringify(payload));
  // history index (cap 50)
  const idxRaw = (await env.DASHBOARD_KV.get("history_index")) ?? "[]";
  const idx = JSON.parse(idxRaw) as number[];
  const next = [ts, ...idx.filter((x) => x !== ts)].slice(0, 50);
  await env.DASHBOARD_KV.put("history_index", JSON.stringify(next));
  await env.DASHBOARD_KV.put(`history:${ts}`, JSON.stringify(payload), { expirationTtl: 60 * 60 * 24 * 14 }); // 14d
}

function requireToken(req: Request, env: Env): boolean {
  if (!env.REFRESH_TOKEN) return true; // if unset, allow (dev-friendly)
  const got = req.headers.get("x-refresh-token") ?? "";
  return got === env.REFRESH_TOKEN;
}

function stableNowIso(): string {
  return new Date().toISOString();
}

async function fetchNews(env: Env): Promise<Dashboard["news"]> {
  // If no key, return empty.
  if (!env.NEWSAPI_KEY) return [];
  // NewsAPI example (you can swap later). Safe: catch errors and return empty.
  try {
    const q = encodeURIComponent("construction OR infrastructure OR housing OR materials");
    const url = `https://newsapi.org/v2/everything?q=${q}&language=en&pageSize=12&sortBy=publishedAt`;
    const res = await fetch(url, { headers: { "X-Api-Key": env.NEWSAPI_KEY } });
    if (!res.ok) return [];
    const data = await res.json() as any;
    const articles = Array.isArray(data.articles) ? data.articles : [];
    return articles.slice(0, 12).map((a: any) => ({
      title: String(a.title ?? "").slice(0, 180),
      source: String(a.source?.name ?? "NewsAPI"),
      url: String(a.url ?? ""),
      publishedAt: String(a.publishedAt ?? ""),
    })).filter((x: any) => x.title && x.url);
  } catch {
    return [];
  }
}

async function fetchTickers(env: Env): Promise<Dashboard["tickers"]> {
  // Keep free + stable: default to empty; later you can wire AlphaVantage/IEX/etc.
  // If you do add AlphaVantage, keep it optional and degrade gracefully.
  return [
    // placeholders (your UI expects something)
    { symbol: "SPY", price: 0, change: 0, changePct: 0 },
    { symbol: "DIA", price: 0, change: 0, changePct: 0 },
    { symbol: "QQQ", price: 0, change: 0, changePct: 0 }
  ];
}

function summarizeTitle(title: string): string {
  // “Free” summarizer: deterministic, cheap, works offline.
  // (We’ll replace with an LLM later if you want.)
  return title
    .replace(/\s+/g, " ")
    .replace(/ - .*$/g, "")
    .trim()
    .slice(0, 120);
}

function deriveSignals(payload: Dashboard): Dashboard["signals"] {
  // Simple signal engine (deterministic)
  const nNews = payload.news.length;
  const dir: "up" | "down" | "flat" = nNews >= 8 ? "up" : nNews <= 2 ? "down" : "flat";
  return [
    { name: "News Velocity", value: `${nNews} items`, direction: dir },
    { name: "Data Freshness", value: payload.generated_at, direction: "flat" }
  ];
}

async function buildDashboard(env: Env): Promise<Dashboard> {
  const generated_at = stableNowIso();
  const [news, tickers] = await Promise.all([fetchNews(env), fetchTickers(env)]);

  const newsWithSummaries = news.map((n) => ({ ...n, summary: summarizeTitle(n.title) }));

  const base: Dashboard = {
    generated_at,
    tickers,
    news: newsWithSummaries,
    construction: [
      { title: "Construction Panel", value: "connected", source: "worker" }
    ],
    signals: []
  };

  base.signals = deriveSignals(base);
  return base;
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

    const url = new URL(req.url);

    if (url.pathname === "/api/health") {
      return json({ ok: true, time: new Date().toISOString() });
    }

    if (url.pathname === "/api/dashboard" && req.method === "GET") {
      const cached = await readLatest(env);
      if (cached) return json(cached);
      const fresh = await buildDashboard(env);
      ctx.waitUntil(writeLatest(env, fresh));
      return json(fresh);
    }

    if (url.pathname === "/api/refresh" && req.method === "POST") {
      if (!requireToken(req, env)) return json({ ok: false, error: "unauthorized" }, 401);
      const fresh = await buildDashboard(env);
      await writeLatest(env, fresh);
      return json({ ok: true, generated_at: fresh.generated_at });
    }

    return json({ ok: false, error: "not_found" }, 404);
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    const fresh = await buildDashboard(env);
    ctx.waitUntil(writeLatest(env, fresh));
  },
};
