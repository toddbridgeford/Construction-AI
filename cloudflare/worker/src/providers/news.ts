import type { NewsItem } from "../types";

export async function fetchNews(newsApiKey?: string): Promise<NewsItem[]> {
  if (newsApiKey) {
    const keyedNews = await fetchFromNewsApi(newsApiKey);
    if (keyedNews.length > 0) return keyedNews;
  }
  return fetchFromHackerNews();
}

async function fetchFromNewsApi(apiKey: string): Promise<NewsItem[]> {
  const endpoint = new URL("https://newsapi.org/v2/top-headlines");
  endpoint.searchParams.set("country", "us");
  endpoint.searchParams.set("category", "business");
  endpoint.searchParams.set("pageSize", "10");

  const response = await fetch(endpoint.toString(), {
    headers: { "X-Api-Key": apiKey },
  });

  if (!response.ok) return [];

  const payload = (await response.json()) as {
    articles?: Array<{ title?: string; source?: { name?: string }; url?: string; publishedAt?: string }>;
  };

  return (payload.articles ?? [])
    .map((article) => ({
      title: article.title ?? "Untitled",
      source: article.source?.name ?? "NewsAPI",
      url: article.url ?? "",
      publishedAt: article.publishedAt ?? new Date().toISOString(),
    }))
    .filter((item) => item.url.length > 0);
}

async function fetchFromHackerNews(): Promise<NewsItem[]> {
  const endpoint = new URL("https://hn.algolia.com/api/v1/search_by_date");
  endpoint.searchParams.set("tags", "story");
  endpoint.searchParams.set("hitsPerPage", "10");

  const response = await fetch(endpoint.toString());
  if (!response.ok) return [];

  const payload = (await response.json()) as {
    hits?: Array<{ title?: string; url?: string; created_at?: string }>;
  };

  return (payload.hits ?? [])
    .map((hit) => ({
      title: hit.title ?? "Untitled",
      source: "Hacker News",
      url: hit.url ?? "",
      publishedAt: hit.created_at ?? new Date().toISOString(),
    }))
    .filter((item) => item.url.length > 0);
}
