import { buildPayload } from "./normalize";
import { fetchNews } from "./providers/news";
import { placeholderConstruction, placeholderSignals } from "./providers/placeholders";
import { fetchTickers, getSymbols } from "./providers/tickers";
import { healthPayload, jsonResponse, optionsResponse } from "./routes";
import { loadLatest, saveSnapshot } from "./storage";
import type { DashboardPayload, Env } from "./types";

async function generateDashboardPayload(env: Env): Promise<DashboardPayload> {
  const symbols = getSymbols(env.SYMBOLS);
  const [tickers, news] = await Promise.all([
    fetchTickers(symbols),
    fetchNews(env.NEWSAPI_KEY),
  ]);

  return buildPayload({
    generatedAt: new Date().toISOString(),
    tickers,
    news,
    construction: placeholderConstruction(),
    signals: placeholderSignals(),
  });
}

async function refreshSnapshot(env: Env): Promise<DashboardPayload> {
  const payload = await generateDashboardPayload(env);
  await saveSnapshot(env, payload);
  return payload;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return optionsResponse(env);

    const { pathname } = new URL(request.url);

    if (pathname === "/api/health") {
      const latest = await loadLatest(env);
      return jsonResponse(env, healthPayload(latest));
    }

    if (pathname === "/api/dashboard") {
      const latest = await loadLatest(env);
      if (latest) return jsonResponse(env, latest);

      const seeded = await refreshSnapshot(env);
      return jsonResponse(env, seeded);
    }

    return jsonResponse(env, { ok: false, error: "not_found" }, { status: 404 });
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(refreshSnapshot(env));
  },
};
