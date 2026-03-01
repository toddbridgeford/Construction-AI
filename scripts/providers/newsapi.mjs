// scripts/providers/newsapi.mjs
import { fetchJson, utcYYYYMMDD, clamp } from "../lib/http.mjs";
import { classifyHeadline, impactScore, sentimentScore } from "../lib/news_classify.mjs";

function daysAgoISO(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

function recencyWeight(publishedAt) {
  // 0.35..1.0 weight: newer = higher
  try {
    const t = new Date(publishedAt).getTime();
    const ageDays = Math.max(0, (Date.now() - t) / (1000 * 60 * 60 * 24));
    return clamp(1.0 - 0.08 * ageDays, 0.35, 1.0);
  } catch {
    return 0.6;
  }
}

export async function fetchNewsAPI({ apiKey, config }) {
  const lookback = Number(config?.lookback_days ?? 7);
  const pageSize = Number(config?.page_size ?? 50);
  const queries = Array.isArray(config?.queries) ? config.queries : [];
  const whitelist = new Set((config?.whitelist_domains ?? []).map(String));

  if (!apiKey) {
    return {
      asof: utcYYYYMMDD(),
      backbone: "newsapi",
      error: "Missing NEWSAPI_KEY",
      headlines: [],
      category_scores: {}
    };
  }

  const all = [];
  for (const q of queries) {
    const url = new URL("https://newsapi.org/v2/everything");
    url.searchParams.set("q", q);
    url.searchParams.set("from", daysAgoISO(lookback));
    url.searchParams.set("sortBy", "publishedAt");
    url.searchParams.set("language", "en");
    url.searchParams.set("pageSize", String(pageSize));
    url.searchParams.set("apiKey", apiKey);

    const json = await fetchJson(url.toString(), { timeoutMs: 12000, retries: 2 });
    const arts = Array.isArray(json?.articles) ? json.articles : [];
    for (const a of arts) {
      const title = a?.title || "";
      const u = a?.url || "";
      const dom = domainOf(u);

      // Optional domain preference: if whitelist provided, softly prefer it
      const whitelisted = whitelist.size === 0 ? true : whitelist.has(dom);

      const tags = classifyHeadline(`${title} ${a?.description || ""}`);
      const imp = impactScore(tags, title);
      const sent = sentimentScore(title);
      const w = recencyWeight(a?.publishedAt);

      all.push({
        title,
        source: a?.source?.name || dom || "NewsAPI",
        domain: dom,
        url: u,
        published_at: a?.publishedAt || null,
        tags,
        sentiment: sent,
        impact: clamp(imp * w * (whitelisted ? 1.05 : 0.9), 0, 1)
      });
    }
  }

  // De-dupe by URL
  const seen = new Set();
  const deduped = [];
  for (const h of all) {
    if (!h.url || seen.has(h.url)) continue;
    seen.add(h.url);
    deduped.push(h);
  }

  // Sort by impact desc
  deduped.sort((a, b) => (b.impact ?? 0) - (a.impact ?? 0));

  // Build category scores (0–100-ish)
  const cat = {};
  for (const h of deduped.slice(0, 40)) {
    for (const t of h.tags) {
      cat[t] = (cat[t] || 0) + (h.impact || 0) * 10;
    }
  }

  // Normalize to 0..100
  const catOut = {};
  for (const [k, v] of Object.entries(cat)) {
    catOut[k] = clamp(Math.round(v * 2.5), 0, 100);
  }

  return {
    asof: utcYYYYMMDD(),
    backbone: "newsapi",
    headlines: deduped.slice(0, 25),
    category_scores: catOut
  };
}
