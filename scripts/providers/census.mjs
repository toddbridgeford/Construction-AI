// scripts/providers/census.mjs
import { fetchJson } from "../lib/http.mjs";

function toNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function computeYoYAnnual(points) {
  if (!Array.isArray(points) || points.length < 2) return null;
  const last = points[points.length - 1];
  const prev = points.find(p => p.date === String(Number(last.date) - 1));
  if (!prev || prev.value == null || prev.value === 0 || last.value == null) return null;
  return (last.value / prev.value - 1) * 100;
}

function computeYoYMonthly(points) {
  if (!Array.isArray(points) || points.length < 13) return null;
  const last = points[points.length - 1];
  const prev = points[points.length - 13];
  if (!last?.value || !prev?.value || prev.value === 0) return null;
  return (last.value / prev.value - 1) * 100;
}

function normalizeTime(row, timeField) {
  const t = row[timeField];
  if (!t) return null;
  const s = String(t);

  // YYYYMM => YYYY-MM
  if (/^\d{6}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}`;

  // YYYY-MM
  if (/^\d{4}-\d{2}$/.test(s)) return s;

  // YYYY
  if (/^\d{4}$/.test(s)) return s;

  // YYYY-MM-DD => YYYY-MM
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(0, 7);

  // NEW: YYYYMmm (e.g., 2023M01) => YYYY-MM
  const m = s.match(/^(\d{4})M(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}`;

  return s;
}

export async function fetchCensus({ apiKey, config }) {
  const sources = Array.isArray(config?.sources) ? config.sources : [];
  if (sources.length === 0) return { asof: null, series: [], error: "config/census_sources.json has no sources[]" };

  const allSeries = [];

  for (const src of sources) {
    const baseUrl = src.base_url;
    const valueField = src.value_field;
    const timeField = src.time_field || "time";

    if (!baseUrl || !valueField) continue;

    const geos = Array.isArray(src.geographies) ? src.geographies : [{ label: "US", params: { for: "us:1" } }];

    for (const g of geos) {
      const url = new URL(baseUrl);

      // fields: always request time + value + extras
      const getFields = [timeField, valueField].concat(src.extra_fields || []);
      url.searchParams.set("get", getFields.join(","));

      // fixed params at the SOURCE level (ex: time=from+2023-01)
      for (const [k, v] of Object.entries(src.fixed_params || {})) {
        url.searchParams.set(k, v);
      }

      // geography params like: { for: "us:*" } or { for: "state:*" } etc
      for (const [k, v] of Object.entries(g.params || {})) {
        url.searchParams.set(k, v);
      }

      // key
      if (apiKey) url.searchParams.set("key", apiKey);

      const data = await fetchJson(url.toString(), { timeoutMs: 20000, retries: 2 });

      if (!Array.isArray(data) || data.length < 2) continue;

      const headers = data[0].map(String);
      const rows = data.slice(1).map(r => {
        const obj = {};
        for (let i = 0; i < headers.length; i++) obj[headers[i]] = r[i];
        return obj;
      });

      const geoKeys = (src.geo_fields || []).filter(Boolean);
      const groupMap = new Map();

      for (const row of rows) {
        const date = normalizeTime(row, timeField);
        const val = toNum(row[valueField]);
        if (!date || val == null) continue;

        const geoId = geoKeys.length
          ? geoKeys.map(k => `${k}:${row[k]}`).join("|")
          : (g.key || g.label);

        if (!groupMap.has(geoId)) groupMap.set(geoId, []);
        groupMap.get(geoId).push({ date, value: val });
      }

      for (const [geoId, pts] of groupMap.entries()) {
        pts.sort((a, b) => a.date.localeCompare(b.date));

        const yoy = (pts[0]?.date?.length === 4) ? computeYoYAnnual(pts) : computeYoYMonthly(pts);

        allSeries.push({
          key: `${src.key}.${g.key || g.label}.${geoId}`,
          name: src.name,
          units: src.units || "",
          region: g.label,
          source: "Census",
          yoy,
          history: pts.slice(-Number(config?.max_points ?? 120))
        });
      }
    }
  }

  return {
    asof: new Date().toISOString(),
    series: allSeries
  };
}
