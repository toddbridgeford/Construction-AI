import { fetchJson, requireEnv } from "./http.js";

export function fredObservationsUrl(env, seriesId, limit = 12, extraParams = {}) {
  const search = new URLSearchParams({
    series_id: String(seriesId),
    api_key: String(env.FRED_API_KEY || ""),
    file_type: "json",
    sort_order: "desc",
    limit: String(limit),
    ...Object.fromEntries(
      Object.entries(extraParams).filter(([, v]) => v !== undefined && v !== null && v !== "")
    ),
  });
  return `https://api.stlouisfed.org/fred/series/observations?${search.toString()}`;
}

export function parseObsValue(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function fetchFredSeries(env, seriesId, limit = 12, extraParams = {}) {
  const missing = requireEnv(env, ["FRED_API_KEY"]);
  if (missing.length) {
    const e = new Error("Missing required env vars");
    e.code = "MISSING_ENV";
    e.details = { missing };
    throw e;
  }

  const url = fredObservationsUrl(env, seriesId, limit, extraParams);
  try {
    return await fetchJson(url, { headers: { accept: "application/json" } });
  } catch (e) {
    const wrapped = new Error("FRED request failed");
    wrapped.code = "UPSTREAM_FRED";
    wrapped.status = e?.status || 0;
    wrapped.details = { message: e?.message || "Unknown upstream error", body: e?.body || null };
    throw wrapped;
  }
}
