// scripts/providers/bls.mjs
import { fetchJson } from "../lib/http.mjs";

function toNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function computeYoYMonthly(points) {
  // points: [{date:"YYYY-MM", value:Number}]
  if (!Array.isArray(points) || points.length < 13) return null;
  const last = points[points.length - 1];
  const prev = points[points.length - 13];
  if (!last?.value || !prev?.value) return null;
  if (prev.value === 0) return null;
  return (last.value / prev.value - 1) * 100;
}

function parseBlsSeries(series, maxPoints = 84) {
  // BLS returns newest-first; we normalize oldest-first and YYYY-MM
  const data = Array.isArray(series?.data) ? series.data : [];
  const trimmed = data.slice(0, maxPoints).map(d => {
    const year = d?.year;
    const period = d?.period; // e.g. "M01"
    if (!year || !period || !/^M\d\d$/.test(period)) return null;
    const mm = period.slice(1);
    return { date: `${year}-${mm}`, value: toNum(d?.value) };
  }).filter(Boolean);

  trimmed.reverse();
  return trimmed;
}

export async function fetchBLS({ apiKey, config }) {
  const seriesList = Array.isArray(config?.series) ? config.series : [];
  const seriesIds = seriesList.map(s => s.series_id).filter(Boolean);

  if (seriesIds.length === 0) {
    return { asof: null, series: [], error: "config/bls_series.json has no series[]" };
  }

  const now = new Date();
  const endYear = now.getUTCFullYear();
  const startYear = endYear - Number(config?.lookback_years ?? 8);

  const payload = {
    seriesid: seriesIds,
    startyear: String(startYear),
    endyear: String(endYear)
  };

  // Registration key is optional on BLS; you have one, so include it.
  if (apiKey) payload.registrationkey = apiKey;

  const url = "https://api.bls.gov/publicAPI/v2/timeseries/data/";
  const json = await fetchJson(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    timeoutMs: 20000,
    retries: 2
  });

  const results = json?.Results?.series || [];
  const out = [];

  for (const s of seriesList) {
    const found = results.find(r => r?.seriesID === s.series_id);
    const history = parseBlsSeries(found, config?.max_points ?? 96);
    const yoy = computeYoYMonthly(history);

    out.push({
      key: s.key,
      name: s.name,
      units: s.units || "",
      region: s.region || "US",
      source: "BLS",
      yoy,
      history
    });
  }

  return {
    asof: new Date().toISOString(),
    series: out
  };
}
