// scripts/build_dashboard_latest.mjs
// CEPS v2 + CPI + Regime + Census BPS + BLS LAUS + SAM + USAspending + EIA + Stocks
// + News (GDELT baseline + NewsAPI Everything + NewsAPI Top Headlines)
// + Signal Impact Engine (headline impact scoring + news pressure overlay into Capital)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function loadEnvFiles() {
  const candidates = [path.join(ROOT, ".env"), path.join(__dirname, ".env")];
  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;
    const rows = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
    for (const row of rows) {
      const trimmed = row.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const cleaned = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
      const eqIdx = cleaned.indexOf("=");
      if (eqIdx <= 0) continue;

      const key = cleaned.slice(0, eqIdx).trim();
      if (!key || process.env[key] !== undefined) continue;

      let value = cleaned.slice(eqIdx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

function sanitizeUrlForLogs(url) {
  try {
    const parsed = new URL(url);
    for (const secretKey of ["api_key", "apikey", "token", "access_token", "key"]) {
      if (parsed.searchParams.has(secretKey)) {
        parsed.searchParams.set(secretKey, "[REDACTED]");
      }
    }
    return parsed.toString();
  } catch {
    return String(url || "");
  }
}

loadEnvFiles();
const OUTFILE = path.join(ROOT, process.env.OUT_PATH || "dashboard_latest.json");

// ---------------------------
// Helpers
// ---------------------------
function mustGetEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}
function getEnv(name, fallback = null) {
  const v = process.env[name];
  const normalized = v == null ? "" : String(v).trim();
  if (!normalized) return fallback;

  // Guard against placeholder values copied from env.example, but only for API key-like vars.
  const isApiKeyEnv = /(?:^|_)(?:API_?)?KEY$/.test(name);
  if (isApiKeyEnv) {
    const placeholderValues = new Set([
      "replace_with_your_fred_api_key",
      "your_fred_api_key",
      "changeme",
      "todo"
    ]);
    if (placeholderValues.has(normalized.toLowerCase())) return fallback;
  }

  return normalized;
}
function safeNumber(x) {
  if (x === null || x === undefined) return null;
  if (typeof x === "number") return Number.isFinite(x) ? x : null;
  const s = String(x).replace(/,/g, "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function clamp(x, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, x));
}
function isoUtcNow() {
  return new Date().toISOString();
}
function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}
function parseCsvEnvList(s) {
  return String(s || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}
function trendArrow(curr, prev, eps = 1e-9) {
  if (curr == null || prev == null) return "→";
  if (Math.abs(curr - prev) <= eps) return "→";
  return curr > prev ? "↑" : "↓";
}
function symbolForTrend(arrow) {
  if (arrow === "↑") return "arrow.up.right";
  if (arrow === "↓") return "arrow.down.right";
  return "arrow.right";
}
function normalizeUrl(u) {
  try {
    const url = new URL(u);
    url.hash = "";
    const clean = new URL(url.toString());
    const drop = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "utm_id",
      "gclid",
      "fbclid"
    ];
    for (const k of drop) clean.searchParams.delete(k);
    return clean.toString();
  } catch {
    return (u || "").trim();
  }
}

// ---------------------------
// Network
// ---------------------------
const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "application/json,text/plain,*/*",
  "Accept-Language": "en-US,en;q=0.9",
  Connection: "keep-alive"
};

async function fetchText(url, opts = {}) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: { ...DEFAULT_HEADERS, ...(opts.headers || {}) },
    ...opts
  });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${sanitizeUrlForLogs(url)}`);
  return await res.text();
}
async function fetchJson(url, opts = {}) {
  const txt = await fetchText(url, opts);
  return JSON.parse(txt);
}
async function fetchBuffer(url) {
  const res = await fetch(url, { redirect: "follow", headers: DEFAULT_HEADERS });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${sanitizeUrlForLogs(url)}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

// ---------------------------
// XLSX helpers
// ---------------------------
function sheetToRowsWithDetectedHeader(ws, headerMatchers) {
  const preview = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    raw: true,
    defval: null
  });
  const maxScan = Math.min(preview.length, 40);

  let headerRowIndex = -1;
  for (let r = 0; r < maxScan; r++) {
    const row = preview[r];
    if (!Array.isArray(row)) continue;

    const cells = row
      .map((v) => (v == null ? "" : String(v)).trim().toLowerCase())
      .filter(Boolean);

    if (cells.length < 2) continue;

    const hits = headerMatchers.every((re) => cells.some((c) => re.test(c)));
    if (hits) {
      headerRowIndex = r;
      break;
    }
  }
  if (headerRowIndex === -1) return null;

  return XLSX.utils.sheet_to_json(ws, {
    defval: null,
    raw: true,
    range: headerRowIndex
  });
}

function xlsxToRowsSmart(buf, headerMatchers) {
  const wb = XLSX.read(buf, { type: "buffer" });
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows = sheetToRowsWithDetectedHeader(ws, headerMatchers);
    if (rows && rows.length > 0) return rows;
  }
  const ws0 = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws0, { defval: null, raw: true });
}

function findCol(row, patterns) {
  const keys = Object.keys(row);
  for (const p of patterns) {
    const re = p instanceof RegExp ? p : new RegExp(p, "i");
    const k = keys.find((x) => re.test(x));
    if (k) return k;
  }
  return null;
}

// ---------------------------
// FRED (SAFE): never hard-fail the whole run on one bad series.
// Fixes your screenshot issue: FRED 400 for NAPM (series id invalid/retired).
// ---------------------------
async function fredObservations({ apiKey, seriesId, limit = 48 }) {
  const url = new URL("https://api.stlouisfed.org/fred/series/observations");
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("series_id", seriesId);
  url.searchParams.set("sort_order", "desc");
  url.searchParams.set("limit", String(limit));
  if (process.env.FRED_OBSERVATION_START) {
    url.searchParams.set("observation_start", process.env.FRED_OBSERVATION_START);
  }
  const json = await fetchJson(url.toString());
  return (json.observations || []).map((o) => ({
    date: o.date,
    value: safeNumber(o.value)
  }));
}

async function fredSeriesSafe(apiKey, seriesId, limit = 48) {
  try {
    const obs = await fredObservations({ apiKey, seriesId, limit });
    return {
      series_id: seriesId,
      ok: true,
      latest: obs[0] ?? null,
      history: obs.slice().reverse()
    };
  } catch (e) {
    return {
      series_id: seriesId,
      ok: false,
      error: String(e?.message || e),
      latest: null,
      history: []
    };
  }
}

function latestValue(series) {
  return series?.latest?.value ?? null;
}
function prevValue(series, kBack = 1) {
  const hist = series?.history;
  if (!Array.isArray(hist) || hist.length < 2) return null;
  const idx = hist.length - 1 - kBack;
  if (idx < 0) return null;
  return hist[idx]?.value ?? null;
}
function avgLastN(history, n, excludeLast = 0) {
  if (!Array.isArray(history) || history.length === 0) return null;
  const end = history.length - excludeLast;
  const start = Math.max(0, end - n);
  const slice = history
    .slice(start, end)
    .map((x) => x.value)
    .filter((v) => v != null);
  if (slice.length === 0) return null;
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

// ---------------------------
// Census BPS (State + CBSA monthly Excel)
// ---------------------------
function parseMonthYear(label) {
  const cleaned = label.replace(/\s+/g, " ").trim();
  const m = cleaned.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!m) return null;
  const monthName = m[1].toLowerCase();
  const year = Number(m[2]);
  const monthMap = {
    january: 0,
    jan: 0,
    february: 1,
    feb: 1,
    march: 2,
    mar: 2,
    april: 3,
    apr: 3,
    may: 4,
    june: 5,
    jun: 5,
    july: 6,
    jul: 6,
    august: 7,
    aug: 7,
    september: 8,
    sep: 8,
    sept: 8,
    october: 9,
    oct: 9,
    november: 10,
    nov: 10,
    december: 11,
    dec: 11
  };
  const mm = monthMap[monthName];
  if (mm === undefined) return null;
  return new Date(Date.UTC(year, mm, 1)).getTime();
}

function pickLatestMonthlyExcelLink(html, baseUrl) {
  const links = [];
  const anchorRe = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = anchorRe.exec(html))) {
    const href = m[1];
    const inner = m[2].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    if (!/\.xls(x)?(\?|$)/i.test(href)) continue;

    const windowStart = Math.max(0, m.index - 400);
    const windowEnd = Math.min(html.length, m.index + 400);
    const windowText = html
      .slice(windowStart, windowEnd)
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const monthYearRe =
      /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}/i;
    const match = inner.match(monthYearRe) || windowText.match(monthYearRe);
    const my = match ? match[0] : null;
    const ts = my ? parseMonthYear(my) : null;

    const abs = href.startsWith("http") ? href : new URL(href, baseUrl).toString();
    links.push({ url: abs, label: my || inner, ts: ts ?? -1 });
  }
  links.sort((a, b) => b.ts - a.ts);
  return links[0] || null;
}

function normalizeCbsa(code) {
  const s = String(code).trim();
  return s.padStart(5, "0");
}

function buildStateNameToFips() {
  const entries = [
    ["Alabama", "01"],
    ["Alaska", "02"],
    ["Arizona", "04"],
    ["Arkansas", "05"],
    ["California", "06"],
    ["Colorado", "08"],
    ["Connecticut", "09"],
    ["Delaware", "10"],
    ["Florida", "12"],
    ["Georgia", "13"],
    ["Hawaii", "15"],
    ["Idaho", "16"],
    ["Illinois", "17"],
    ["Indiana", "18"],
    ["Iowa", "19"],
    ["Kansas", "20"],
    ["Kentucky", "21"],
    ["Louisiana", "22"],
    ["Maine", "23"],
    ["Maryland", "24"],
    ["Massachusetts", "25"],
    ["Michigan", "26"],
    ["Minnesota", "27"],
    ["Mississippi", "28"],
    ["Missouri", "29"],
    ["Montana", "30"],
    ["Nebraska", "31"],
    ["Nevada", "32"],
    ["New Hampshire", "33"],
    ["New Jersey", "34"],
    ["New Mexico", "35"],
    ["New York", "36"],
    ["North Carolina", "37"],
    ["North Dakota", "38"],
    ["Ohio", "39"],
    ["Oklahoma", "40"],
    ["Oregon", "41"],
    ["Pennsylvania", "42"],
    ["Rhode Island", "44"],
    ["South Carolina", "45"],
    ["South Dakota", "46"],
    ["Tennessee", "47"],
    ["Texas", "48"],
    ["Utah", "49"],
    ["Vermont", "50"],
    ["Virginia", "51"],
    ["Washington", "53"],
    ["West Virginia", "54"],
    ["Wisconsin", "55"],
    ["Wyoming", "56"]
  ];
  const m = new Map();
  for (const [n, f] of entries) m.set(n.toLowerCase(), f);
  return m;
}

async function loadCensusBpsLatest() {
  const cbsaPage = "https://www.census.gov/construction/bps/msamonthly.html";
  const statePage = "https://www.census.gov/construction/bps/statemonthly.html";

  const cbsaHtml = await fetchText(cbsaPage);
  const stateHtml = await fetchText(statePage);

  const cbsaLink = pickLatestMonthlyExcelLink(cbsaHtml, cbsaPage);
  const stateLink = pickLatestMonthlyExcelLink(stateHtml, statePage);

  if (!cbsaLink) throw new Error("Could not find CBSA monthly excel link");
  if (!stateLink) throw new Error("Could not find State monthly excel link");

  const cbsaXls = await fetchBuffer(cbsaLink.url);
  const stateXls = await fetchBuffer(stateLink.url);

  const cbsaRows = xlsxToRowsSmart(cbsaXls, [/cbsa|msa/i, /total/i]);
  const stateRows = xlsxToRowsSmart(stateXls, [/state/i, /total/i]);

  const cbsaPermit = new Map();
  for (const r of cbsaRows) {
    const cbsaCol = findCol(r, [/cbsa/i, /msa/i, /code/i]);
    const nameCol = findCol(r, [/name/i, /title/i, /area/i]);
    if (!cbsaCol) continue;

    const code = safeNumber(r[cbsaCol]);
    if (!code) continue;

    const cbsa = normalizeCbsa(code);
    const name = nameCol ? String(r[nameCol] ?? "").trim() : null;

    const totalCol = findCol(r, [/total/i]);
    const sfCol = findCol(r, [/1\s*unit/i, /single/i, /1-unit/i]);
    const mfCol = findCol(r, [/2\+?\s*units/i, /multi/i, /2\+ units/i]);

    const total = totalCol ? safeNumber(r[totalCol]) : null;
    const sf = sfCol ? safeNumber(r[sfCol]) : null;
    const mf2p = mfCol ? safeNumber(r[mfCol]) : null;

    if (total === null && sf === null && mf2p === null) continue;
    cbsaPermit.set(cbsa, { name, total, sf, mf2p });
  }

  const statePermit = new Map();
  const stateNameToFips = buildStateNameToFips();
  for (const r of stateRows) {
    const nameCol = findCol(r, [/state/i]);
    if (!nameCol) continue;

    const name = String(r[nameCol] ?? "").trim();
    const fips = stateNameToFips.get(name.toLowerCase());
    if (!fips) continue;

    const totalCol = findCol(r, [/total/i]);
    const sfCol = findCol(r, [/1\s*unit/i, /single/i, /1-unit/i]);
    const mfCol = findCol(r, [/2\+?\s*units/i, /multi/i, /2\+ units/i]);

    const total = totalCol ? safeNumber(r[totalCol]) : null;
    const sf = sfCol ? safeNumber(r[sfCol]) : null;
    const mf2p = mfCol ? safeNumber(r[mfCol]) : null;

    if (total === null && sf === null && mf2p === null) continue;
    statePermit.set(fips, { name, total, sf, mf2p });
  }

  return {
    cbsa: { link: cbsaLink, permit: cbsaPermit },
    state: { link: stateLink, permit: statePermit }
  };
}

// ---------------------------
// BLS LAUS (State + Metro + Micro unemployment)
// ---------------------------
function normalizeAreaNameForJoin(name) {
  if (!name) return null;
  let s = String(name).trim();
  s = s.replace(/\s+Metropolitan Statistical Area$/i, "");
  s = s.replace(/\s+Micropolitan Statistical Area$/i, "");
  s = s.replace(/\s+/g, " ").trim();
  return s.toLowerCase();
}

async function loadBlsLausUnempRatesLatest() {
  const base = "https://download.bls.gov/pub/time.series/la/";

  const seriesTxt = await fetchText(base + "la.series");
  const unempSeries = new Map();

  const lines = seriesTxt.split("\n").filter(Boolean);
  const header = lines[0].trim().split(/\s+/);
  const idx = (name) => header.indexOf(name);

  const iSeries = idx("series_id");
  const iAreaType = idx("area_type_code");
  const iAreaCode = idx("area_code");
  const iMeasure = idx("measure_code");
  const iSeasonal = idx("seasonal");

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].trim().split(/\s+/);
    if (parts.length < header.length) continue;

    const series_id = parts[iSeries];
    const area_type_code = parts[iAreaType];
    const area_code = parts[iAreaCode];
    const measure_code = parts[iMeasure];
    const seasonal = parts[iSeasonal];

    if (measure_code !== "03") continue; // unemployment rate
    unempSeries.set(series_id, { area_type_code, area_code, seasonal });
  }

  const areaTxt = await fetchText(base + "la.area");
  const areaLines = areaTxt.split("\n").filter(Boolean);
  const areaHeader = areaLines[0].trim().split(/\s+/);
  const aIdx = (name) => areaHeader.indexOf(name);

  const iaType = aIdx("area_type_code");
  const iaCode = aIdx("area_code");
  const iaText = aIdx("area_text");

  const areaTextByTypeCode = new Map();
  for (let i = 1; i < areaLines.length; i++) {
    const raw = areaLines[i];
    const parts = raw.trim().split(/\s+/);
    if (parts.length < iaText + 1) continue;
    const t = parts[iaType];
    const c = parts[iaCode];
    const text = parts.slice(iaText).join(" ").trim();
    areaTextByTypeCode.set(`${t}:${c}`, text);
  }

  const dataSources = [
    { url: base + "la.data.3.AllStatesS", wantSeasonal: "S" },
    { url: base + "la.data.60.Metro", wantSeasonal: "U" },
    { url: base + "la.data.62.Micro", wantSeasonal: "U" }
  ];

  const latest = new Map();

  for (const src of dataSources) {
    const txt = await fetchText(src.url);
    const lns = txt.split("\n").filter(Boolean);
    const h = lns[0].trim().split(/\s+/);
    const sIdx = (name) => h.indexOf(name);
    const isSeries = sIdx("series_id");
    const isYear = sIdx("year");
    const isPeriod = sIdx("period");
    const isValue = sIdx("value");

    for (let i = 1; i < lns.length; i++) {
      const parts = lns[i].trim().split(/\s+/);
      if (parts.length < h.length) continue;

      const series_id = parts[isSeries];
      const meta = unempSeries.get(series_id);
      if (!meta) continue;
      if (meta.seasonal !== src.wantSeasonal) continue;

      const year = Number(parts[isYear]);
      const period = parts[isPeriod];
      if (!/^M\d{2}$/.test(period)) continue;
      const month = Number(period.slice(1));
      const key = year * 100 + month;
      const value = safeNumber(parts[isValue]);

      const prev = latest.get(series_id);
      if (!prev || key > prev.key) latest.set(series_id, { key, year, month, value });
    }
  }

  const stateUnemp = new Map();
  const cbsaUnempByNormName = new Map();

  for (const [series_id, obs] of latest.entries()) {
    const meta = unempSeries.get(series_id);
    if (!meta) continue;

    const area_text = areaTextByTypeCode.get(`${meta.area_type_code}:${meta.area_code}`) || null;

    const mState = series_id.match(/^LAU[SU]T(\d{2})00000000000003$/);
    if (mState) {
      stateUnemp.set(mState[1], {
        value: obs.value,
        year: obs.year,
        month: obs.month,
        series_id,
        area_text
      });
      continue;
    }

    const norm = normalizeAreaNameForJoin(area_text);
    if (!norm) continue;

    const row = { value: obs.value, year: obs.year, month: obs.month, series_id, area_text };
    const existing = cbsaUnempByNormName.get(norm);
    if (!existing) cbsaUnempByNormName.set(norm, [row]);
    else existing.push(row);
  }

  return { stateUnemp, cbsaUnempByNormName };
}

// ---------------------------
// USAspending (award search + multi-window rollups)
// ---------------------------
function daysAgoISO(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

async function usaspendingAwardSearch({ lookbackDays = 30, limit = 80, naicsCodes = ["23"], keywords = [] }) {
  const url = "https://api.usaspending.gov/api/v2/award/search/";
  const start = daysAgoISO(lookbackDays);
  const end = daysAgoISO(0);
  const keywordString = keywords.length ? keywords.join(" OR ") : null;

  const body = {
    filters: {
      time_period: [{ start_date: start, end_date: end }],
      naics_codes: naicsCodes
    },
    fields: [
      "Award ID",
      "Recipient Name",
      "Start Date",
      "End Date",
      "Award Amount",
      "Award Type",
      "Awarding Agency",
      "Funding Agency",
      "Place of Performance State Code",
      "Description"
    ],
    page: 1,
    limit,
    sort: "Award Amount",
    order: "desc"
  };
  if (keywordString) body.filters.keywords = keywordString;

  try {
    const json = await fetchJson(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const results = Array.isArray(json?.results) ? json.results : [];
    const total = safeNumber(json?.total) ?? null;

    const items = results.map((r) => ({
      award_id: r["Award ID"] ?? null,
      recipient: r["Recipient Name"] ?? null,
      start_date: r["Start Date"] ?? null,
      end_date: r["End Date"] ?? null,
      amount: safeNumber(r["Award Amount"]),
      award_type: r["Award Type"] ?? null,
      awarding_agency: r["Awarding Agency"] ?? null,
      funding_agency: r["Funding Agency"] ?? null,
      pop_state: r["Place of Performance State Code"] ?? null,
      description: r["Description"] ?? null
    }));

    return { enabled: true, lookback_days: lookbackDays, limit, naics_codes: naicsCodes, keywords, total_results: total, items };
  } catch (e) {
    return { enabled: true, error: String(e?.message || e), lookback_days: lookbackDays, limit, naics_codes: naicsCodes, keywords, total_results: null, items: [] };
  }
}

function rollupTop(items, keyFn, amountFn, topN = 10) {
  const m = new Map();
  for (const it of items) {
    const k = keyFn(it) ?? "NA";
    const a = amountFn(it) ?? 0;
    const cur = m.get(k) || { count: 0, amount: 0 };
    cur.count += 1;
    cur.amount += a;
    m.set(k, cur);
  }
  return Array.from(m.entries())
    .map(([k, v]) => ({ key: k, count: v.count, amount: v.amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, topN);
}

function buildUsaspendingRollups(items) {
  const by_state = rollupTop(items, (x) => x.pop_state, (x) => x.amount, 15);
  const by_awarding_agency = rollupTop(items, (x) => x.awarding_agency, (x) => x.amount, 12);
  const by_funding_agency = rollupTop(items, (x) => x.funding_agency, (x) => x.amount, 12);
  const by_recipient = rollupTop(items, (x) => x.recipient, (x) => x.amount, 15);
  const by_award_type = rollupTop(items, (x) => x.award_type, (x) => x.amount, 10);

  const total_amount = items.reduce((a, b) => a + (b.amount || 0), 0);
  const count = items.length;

  return { count, total_amount, by_state, by_awarding_agency, by_funding_agency, by_recipient, by_award_type };
}

async function usaspendingRollupsMultiWindow({ naicsCodes, keywords, limit }) {
  const windows = [7, 30, 90];
  const out = {};
  for (const w of windows) {
    const res = await usaspendingAwardSearch({ lookbackDays: w, limit, naicsCodes, keywords });
    const items = res.items || [];
    out[`d${w}`] = {
      meta: { enabled: res.enabled, error: res.error || null, total_results: res.total_results ?? null },
      rollups: buildUsaspendingRollups(items),
      top_awards: items.slice(0, 25)
    };
  }
  return out;
}

// ---------------------------
// EIA (best-effort v2 + legacy fallback)
// ---------------------------
async function fetchEiaSeriesBestEffort({ apiKey, seriesId, maxPoints = 120 }) {
  const tried = [];

  try {
    // best-effort v2 attempt
    const u = new URL("https://api.eia.gov/v2/seriesid/");
    u.searchParams.set("api_key", apiKey);
    u.searchParams.set("series_id", seriesId);
    tried.push(u.toString());
    const j = await fetchJson(u.toString());
    const data = j?.response?.data || j?.response?.series?.[0]?.data || null;

    if (Array.isArray(data) && data.length) {
      const obs = data
        .slice(0, maxPoints)
        .map((r) => {
          if (Array.isArray(r)) return { date: String(r[0]), value: safeNumber(r[1]) };
          return { date: String(r.period ?? r.date ?? r[0] ?? ""), value: safeNumber(r.value ?? r[1]) };
        })
        .filter((o) => o.date);
      if (obs.length) return { ok: true, endpoint: "eia_v2_seriesid", series_id: seriesId, observations: obs, tried };
    }
  } catch {}

  try {
    const u = new URL("https://api.eia.gov/series/");
    u.searchParams.set("api_key", apiKey);
    u.searchParams.set("series_id", seriesId);
    tried.push(u.toString());

    const j = await fetchJson(u.toString());
    const s = j?.series?.[0];
    const data = s?.data;

    if (Array.isArray(data) && data.length) {
      const obs = data
        .slice(0, maxPoints)
        .map((r) => ({ date: String(r[0]), value: safeNumber(r[1]) }))
        .filter((o) => o.date);
      return {
        ok: true,
        endpoint: "eia_legacy_series",
        series_id: seriesId,
        name: s?.name ?? null,
        units: s?.units ?? null,
        observations: obs,
        tried
      };
    }

    return { ok: false, endpoint: "eia_legacy_series", series_id: seriesId, error: "No data returned", tried };
  } catch (e) {
    return { ok: false, endpoint: null, series_id: seriesId, error: String(e?.message || e), tried };
  }
}

async function fetchEiaPack({ apiKey, seriesIds, maxPoints }) {
  if (!apiKey) return { enabled: false, reason: "Missing EIA_API_KEY", energy_overlay: 0, series: [] };
  if (!Array.isArray(seriesIds) || seriesIds.length === 0) {
    return { enabled: true, warning: "No EIA_SERIES_IDS configured", energy_overlay: 0, series: [] };
  }

  const series = [];
  for (const id of seriesIds) {
    try {
      const res = await fetchEiaSeriesBestEffort({ apiKey, seriesId: id, maxPoints });
      series.push(res);
    } catch (e) {
      series.push({ ok: false, series_id: id, error: String(e?.message || e) });
    }
  }

  // simple overlay: if latest is materially above prior 12-month average, add stress
  let energy_overlay = 0;
  const firstOk = series.find((x) => x.ok && Array.isArray(x.observations) && x.observations.length >= 24);
  if (firstOk) {
    const obs = firstOk.observations.slice().reverse();
    const latest = obs[obs.length - 1]?.value ?? null;
    const prev12 = obs
      .slice(Math.max(0, obs.length - 24), Math.max(0, obs.length - 12))
      .map((x) => x.value)
      .filter((v) => v != null);

    if (latest != null && prev12.length) {
      const avgPrev12 = prev12.reduce((a, b) => a + b, 0) / prev12.length;
      if (avgPrev12 > 0) {
        const ratio = latest / avgPrev12;
        if (ratio >= 1.25) energy_overlay = 5;
        if (ratio >= 1.5) energy_overlay = 10;
      }
    }
  }

  return { enabled: true, energy_overlay, series };
}

// ---------------------------
// NEWS: GDELT baseline + NewsAPI Everything + NewsAPI Top Headlines
// + Merge/Dedupe + Signal Impact Engine
// ---------------------------
function daysAgoUTC(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}
function toGdeltDatetime(d) {
  const yyyy = String(d.getUTCFullYear());
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const HH = String(d.getUTCHours()).padStart(2, "0");
  const MM = String(d.getUTCMinutes()).padStart(2, "0");
  const SS = String(d.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}${HH}${MM}${SS}`;
}

async function fetchGdeltNews({ query, lookbackDays = 5, max = 60 }) {
  const start = toGdeltDatetime(daysAgoUTC(lookbackDays));
  const url = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
  url.searchParams.set("query", query);
  url.searchParams.set("mode", "ArtList");
  url.searchParams.set("format", "json");
  url.searchParams.set("maxrecords", String(max));
  url.searchParams.set("startdatetime", start);

  const json = await fetchJson(url.toString());
  const arts = Array.isArray(json?.articles) ? json.articles : [];
  return arts
    .map((a) => ({
      title: a.title ?? null,
      url: a.url ?? null,
      source: a.sourceCommonName ?? a.domain ?? a.sourceCountry ?? null,
      published_at: a.seendate ?? a.datetime ?? null,
      provider: "gdelt",
      feed: "baseline"
    }))
    .filter((x) => x.title && x.url);
}

// NewsAPI.org /v2/everything
async function fetchNewsApiEverything({
  apiKey,
  query,
  lookbackDays = 10,
  max = 80,
  language = "en",
  sortBy = "publishedAt"
}) {
  if (!apiKey) return { enabled: false, reason: "Missing NEWS_API_KEY", items: [] };

  const from = (() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - lookbackDays);
    return d.toISOString();
  })();

  const url = new URL("https://newsapi.org/v2/everything");
  url.searchParams.set("q", query);
  url.searchParams.set("from", from);
  url.searchParams.set("language", language);
  url.searchParams.set("sortBy", sortBy);
  url.searchParams.set("pageSize", String(Math.min(100, max)));

  try {
    const json = await fetchJson(url.toString(), {
      headers: { "X-Api-Key": apiKey }
    });

    const arts = Array.isArray(json?.articles) ? json.articles : [];
    const items = arts
      .map((a) => ({
        title: a.title ?? null,
        url: a.url ?? null,
        source: a.source?.name ?? null,
        published_at: a.publishedAt ?? null,
        provider: "newsapi",
        feed: "everything",
        description: a.description ?? null
      }))
      .filter((x) => x.title && x.url);

    return { enabled: true, status: json?.status ?? null, totalResults: json?.totalResults ?? null, items: items.slice(0, max) };
  } catch (e) {
    return { enabled: true, error: String(e?.message || e), items: [] };
  }
}

// NewsAPI.org /v2/top-headlines
async function fetchNewsApiTopHeadlines({ apiKey, country = "us", category = "business", pageSize = 30 }) {
  if (!apiKey) return { enabled: false, reason: "Missing NEWS_API_KEY", items: [] };

  const url = new URL("https://newsapi.org/v2/top-headlines");
  url.searchParams.set("country", country);
  url.searchParams.set("category", category);
  url.searchParams.set("pageSize", String(Math.min(100, pageSize)));

  try {
    const json = await fetchJson(url.toString(), {
      headers: { "X-Api-Key": apiKey }
    });

    const arts = Array.isArray(json?.articles) ? json.articles : [];
    const items = arts
      .map((a) => ({
        title: a.title ?? null,
        url: a.url ?? null,
        source: a.source?.name ?? null,
        published_at: a.publishedAt ?? null,
        provider: "newsapi",
        feed: "top_headlines",
        description: a.description ?? null
      }))
      .filter((x) => x.title && x.url);

    return { enabled: true, status: json?.status ?? null, totalResults: json?.totalResults ?? null, items };
  } catch (e) {
    return { enabled: true, error: String(e?.message || e), items: [] };
  }
}

function mergeAndDedupeNews({ topHeadlines, premiumEverything, gdeltItems, maxOut = 140 }) {
  // Priority order: Top Headlines first, then Everything, then GDELT
  const all = [...(topHeadlines || []), ...(premiumEverything || []), ...(gdeltItems || [])];

  const seen = new Set();
  const out = [];

  for (const it of all) {
    const url = it.url ? normalizeUrl(it.url) : null;
    const key = url || (it.title ? it.title.toLowerCase().trim() : null);
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      title: it.title,
      url,
      source: it.source ?? null,
      published_at: it.published_at ?? null,
      provider: it.provider ?? "unknown",
      feed: it.feed ?? "unknown",
      description: it.description ?? null
    });

    if (out.length >= maxOut) break;
  }

  const counts = out.reduce((acc, x) => {
    const k = `${x.provider}:${x.feed}`;
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});

  return { unified: out, counts };
}

// Theme classifier (used for clusters + land tracker)
function classifyNewsItem(title) {
  const t = String(title || "").toLowerCase();
  const themes = [];
  if (/(fed|rate|yield|treasury|mortgage|credit|default|bank|liquidity|bond spread|downgrade)/i.test(t)) themes.push("capital");
  if (/(permit|permits|starts|housing start|pipeline|backlog|pre[- ]?construction|entitlement|bid pipeline)/i.test(t)) themes.push("pipeline");
  if (/(labor|wage|union|strike|subcontract|crew|trade shortage|overtime)/i.test(t)) themes.push("trade");
  if (/(lumber|steel|cement|concrete|gypsum|drywall|asphalt|tariff|input cost|shortage|diesel|fuel|energy)/i.test(t)) themes.push("materials");
  if (/(code|zoning|regulation|permit reform|environmental review|nepa)/i.test(t)) themes.push("regulatory");
  if (/(construction spending|capex|pmi|consumer|sentiment|recession|inflation)/i.test(t)) themes.push("macro");
  if (/(acquire|acquired|purchase|purchased|buying|bought)\s+land|land\s+(deal|purchase|acquisition)|site\s+purchase|master[- ]planned|entitled\s+land/i.test(t)) themes.push("land");
  if (/(multifamily|apartment|rental|single[- ]family|homebuilder|subdivision)/i.test(t)) themes.push("residential");
  if (/(industrial|warehouse|data center|office|retail|hotel|logistics|manufacturing plant)/i.test(t)) themes.push("commercial");
  if (themes.length === 0) themes.push("other");
  return Array.from(new Set(themes));
}

function buildNewsClusters(news) {
  const clusters = { capital: [], pipeline: [], trade: [], materials: [], regulatory: [], macro: [], land: [], other: [] };
  for (const n of news) {
    const themes = classifyNewsItem(n.title);
    for (const th of themes) {
      if (!clusters[th]) clusters[th] = [];
      clusters[th].push({ ...n, themes });
    }
  }
  for (const k of Object.keys(clusters)) clusters[k] = clusters[k].slice(0, 12);
  return clusters;
}

function buildLandTracker(news) {
  const landItems = news
    .map((n) => ({ ...n, themes: classifyNewsItem(n.title) }))
    .filter((n) => n.themes.includes("land"))
    .slice(0, 50);

  const purpose = { residential: 0, commercial: 0, mixed: 0, unknown: 0 };
  for (const it of landItems) {
    const r = it.themes.includes("residential");
    const c = it.themes.includes("commercial");
    if (r && c) purpose.mixed++;
    else if (r) purpose.residential++;
    else if (c) purpose.commercial++;
    else purpose.unknown++;
  }

  return { total_mentions: landItems.length, purpose_breakdown: purpose, items: landItems.slice(0, 15) };
}

// ---------------------------
// SIGNAL IMPACT ENGINE (SIE)
// ---------------------------
function computeSignalImpactScore(title) {
  const t = String(title || "").toLowerCase();

  let score = 40; // baseline

  // Capital shock (largest)
  if (/(fed|rate hike|rate cut|yield|treasury|mortgage|credit|default|bank|liquidity|bond spread|downgrade|delinquency)/i.test(t)) score += 25;

  // Pipeline shifts
  if (/(permits|housing starts|construction spending|backlog|project canceled|delay|slowdown|pause|pre[- ]?construction)/i.test(t)) score += 20;

  // Materials shock
  if (/(lumber|steel|cement|concrete|diesel|oil|gasoline|tariff|input cost|shortage|price surge|supply chain)/i.test(t)) score += 15;

  // Regulatory shift
  if (/(zoning|building code|regulation|permit reform|environmental review|nepa|impact fee)/i.test(t)) score += 10;

  // Land deals
  if (/(land acquisition|site purchase|master[- ]planned|acquired land|entitled land|land deal)/i.test(t)) score += 10;

  // Crisis language (adds)
  if (/(recession|collapse|freeze|default|bankruptcy|foreclosure|credit crunch)/i.test(t)) score += 20;

  // Softening language (reduces)
  if (/(easing|cooling|rate cuts|soft landing|inflation falls|disinflation)/i.test(t)) score -= 10;

  return clamp(score, 0, 100);
}

function computeNewsPressureOverlay(newsWithImpact) {
  if (!Array.isArray(newsWithImpact) || newsWithImpact.length === 0) return 0;

  const top = newsWithImpact
    .slice()
    .sort((a, b) => (b.impact_score ?? 0) - (a.impact_score ?? 0))
    .slice(0, 15);

  const avg = top.reduce((a, b) => a + (b.impact_score || 0), 0) / top.length;

  // deterministic overlay into Capital (temporary)
  if (avg >= 80) return 12;
  if (avg >= 70) return 8;
  if (avg >= 60) return 5;
  return 0;
}

// ---------------------------
// STOCKS (stooq baseline + AlphaVantage priority)
// ---------------------------
function normalizeTickerList(s) {
  return String(s || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => x.toUpperCase());
}
function parseCsvLine(line) {
  return line.split(",").map((x) => x.trim());
}
async function fetchStooqQuote(ticker) {
  const t = ticker.toLowerCase();
  const stooqSymbol = t.includes(".") ? t : `${t}.us`;

  const url = new URL("https://stooq.com/q/l/");
  url.searchParams.set("s", stooqSymbol);
  url.searchParams.set("f", "sd2t2ohlcv");
  url.searchParams.set("h", "");
  url.searchParams.set("e", "csv");

  const csv = await fetchText(url.toString());
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return null;

  const header = parseCsvLine(lines[0]);
  const row = parseCsvLine(lines[1]);
  const idx = (name) => header.indexOf(name);

  const close = safeNumber(row[idx("Close")]);
  const open = safeNumber(row[idx("Open")]);
  const date = row[idx("Date")] ?? null;

  if (close == null) return null;
  const chg = open != null ? close - open : null;
  const chgPct = open != null && open !== 0 ? (chg / open) * 100 : null;

  return { ticker: ticker.toUpperCase(), source: "stooq", date, open, close, change: chg, change_pct: chgPct };
}
async function fetchAlphaVantageQuote(ticker, apiKey) {
  const url = new URL("https://www.alphavantage.co/query");
  url.searchParams.set("function", "GLOBAL_QUOTE");
  url.searchParams.set("symbol", ticker);
  url.searchParams.set("apikey", apiKey);

  const json = await fetchJson(url.toString());
  if (json?.Note) return { rate_limited: true, note: json.Note };

  const q = json?.["Global Quote"];
  if (!q) return null;

  const close = safeNumber(q["05. price"]);
  const prevClose = safeNumber(q["08. previous close"]);
  const change = safeNumber(q["09. change"]);
  const changePct = q["10. change percent"] ? safeNumber(String(q["10. change percent"]).replace("%", "")) : null;

  return { ticker: ticker.toUpperCase(), source: "alphavantage", date: q["07. latest trading day"] ?? null, close, prev_close: prevClose, change, change_pct: changePct };
}
async function fetchStockUniverse({ tickers, alphaKey, alphaPriority }) {
  const out = [];
  const prioritySet = new Set(alphaPriority);
  let alphaBudget = Math.min(alphaPriority.length, 12);

  for (const t of tickers) {
    try {
      const s = await fetchStooqQuote(t);
      if (s) out.push(s);
    } catch {}

    if (alphaKey && prioritySet.has(t) && alphaBudget > 0) {
      try {
        const av = await fetchAlphaVantageQuote(t, alphaKey);
        if (av?.rate_limited) {
          alphaBudget = 0;
        } else if (av) {
          const idx = out.findIndex((x) => x.ticker === t);
          if (idx >= 0) out[idx] = av;
          else out.push(av);
          alphaBudget--;
        }
      } catch {}
    }
  }
  return out;
}
function buildSectorRollups(stocks) {
  const groups = {
    builders: ["DHI", "LEN", "PHM", "NVR", "TOL"],
    materials: ["VMC", "MLM", "EXP", "OC", "FBIN", "USCR", "CRH"],
    distribution: ["BLDR"],
    equipment: ["CAT", "DE", "URI"],
    retail: ["HD", "LOW"]
  };
  const rollups = {};
  for (const [sector, list] of Object.entries(groups)) {
    const subset = stocks.filter((s) => list.includes(s.ticker));
    const avgChange = subset.length ? subset.reduce((a, b) => a + (b.change_pct ?? 0), 0) / subset.length : null;
    rollups[sector] = { count: subset.length, avg_change_pct: avgChange };
  }
  return rollups;
}
function computeStockOverlay(sector_rollups) {
  const b = sector_rollups?.builders?.avg_change_pct;
  const m = sector_rollups?.materials?.avg_change_pct;
  let overlay = 0;
  if (b != null && b < -2) overlay += 5;
  if (m != null && m < -2) overlay += 5;
  return clamp(overlay, 0, 15);
}

// ---------------------------
// SAM.gov
// ---------------------------
async function fetchSamGovOpportunities({ apiKey, lookbackDays = 7, max = 50 }) {
  if (!apiKey) return { enabled: false, reason: "Missing SAM_API_KEY", items: [] };

  const keywords = [
    "construction",
    "renovation",
    "design-build",
    "general contractor",
    "roofing",
    "HVAC",
    "electrical",
    "plumbing",
    "concrete",
    "civil"
  ];
  const q = keywords.map((k) => `"${k}"`).join(" OR ");

  const url = new URL("https://api.sam.gov/opportunities/v2/search");
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("limit", String(max));
  url.searchParams.set("q", q);

  const from = (() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - lookbackDays);
    return d.toISOString().slice(0, 10);
  })();
  url.searchParams.set("postedFrom", from);

  try {
    const json = await fetchJson(url.toString());
    const opps = Array.isArray(json?.opportunitiesData) ? json.opportunitiesData : [];
    const items = opps
      .map((o) => ({
        title: o.title ?? o.noticeTitle ?? null,
        url: o.uiLink ?? o.link ?? null,
        posted: o.postedDate ?? null,
        dept: o.department ?? o.departmentName ?? null,
        type: o.noticeType ?? null,
        place: o.placeOfPerformance?.city?.name ?? o.placeOfPerformance?.state?.code ?? null
      }))
      .filter((x) => x.title);
    return { enabled: true, items: items.slice(0, max) };
  } catch (e) {
    return { enabled: true, error: String(e?.message || e), items: [] };
  }
}

// ---------------------------
// CPI Engine + regime/pulse
// ---------------------------
function momentumBand(delta3m) {
  if (delta3m == null) return "Stable";
  if (delta3m >= 8) return "Accelerating Stress";
  if (delta3m >= 4) return "Rising";
  if (delta3m <= -8) return "Rapid Relief";
  if (delta3m <= -4) return "Easing";
  return "Stable";
}
function zoneForCpi(x) {
  if (x >= 76) return "Freeze Risk";
  if (x >= 61) return "Tightening";
  if (x >= 46) return "Slowdown";
  if (x >= 31) return "Late Expansion";
  return "Expansion";
}
function severityForCpi(x) {
  if (x >= 76) return "CRITICAL";
  if (x >= 70) return "ELEVATED";
  if (x >= 60) return "WATCH";
  return "NORMAL";
}
function computeDelta3mFromHistory(historyArr) {
  if (!Array.isArray(historyArr) || historyArr.length < 4) return null;
  const curr = historyArr[historyArr.length - 1]?.value ?? null;
  const prev = historyArr[Math.max(0, historyArr.length - 4)]?.value ?? null;
  if (curr == null || prev == null) return null;
  return curr - prev;
}
function weightedAvg(items) {
  const usable = items.filter((x) => x.value != null && Number.isFinite(x.value) && x.weight > 0);
  if (usable.length === 0) return 50;
  const wSum = usable.reduce((a, b) => a + b.weight, 0);
  if (wSum <= 0) return 50;
  return clamp(usable.reduce((a, b) => a + b.value * b.weight, 0) / wSum);
}
function computeCpiEngine({ capitalScore, pipelineScore, tradeScore, materialsScore, regulatoryScore, macroScore }) {
  const C = capitalScore ?? 50;
  const P = pipelineScore ?? 50;
  const T = tradeScore ?? 50;
  const M = materialsScore ?? 50;
  const R = regulatoryScore ?? 50;
  const S = macroScore ?? 50;

  const cpi_sf = weightedAvg([
    { value: C, weight: 0.4 },
    { value: P, weight: 0.35 },
    { value: T, weight: 0.15 },
    { value: M, weight: 0.05 },
    { value: S, weight: 0.05 }
  ]);
  const cpi_mf = weightedAvg([
    { value: C, weight: 0.3 },
    { value: P, weight: 0.3 },
    { value: T, weight: 0.15 },
    { value: S, weight: 0.15 },
    { value: M, weight: 0.05 },
    { value: R, weight: 0.05 }
  ]);
  const cpi_inst = weightedAvg([
    { value: P, weight: 0.3 },
    { value: R, weight: 0.25 },
    { value: C, weight: 0.15 },
    { value: T, weight: 0.1 },
    { value: M, weight: 0.1 },
    { value: S, weight: 0.1 }
  ]);
  const cpi_infra = weightedAvg([
    { value: P, weight: 0.3 },
    { value: T, weight: 0.25 },
    { value: M, weight: 0.2 },
    { value: C, weight: 0.1 },
    { value: S, weight: 0.1 },
    { value: R, weight: 0.05 }
  ]);

  const cpi_r = clamp(0.6 * cpi_sf + 0.4 * cpi_mf);
  const cpi_i = clamp(0.55 * cpi_inst + 0.45 * cpi_infra);
  const headline = clamp(0.55 * cpi_r + 0.45 * cpi_i);

  return {
    cpi_sf: Math.round(cpi_sf),
    cpi_mf: Math.round(cpi_mf),
    cpi_inst: Math.round(cpi_inst),
    cpi_infra: Math.round(cpi_infra),
    cpi_r: Math.round(cpi_r),
    cpi_i: Math.round(cpi_i),
    headline: Math.round(headline),
    divergences: {
      r_minus_i: Math.round(cpi_r - cpi_i),
      sf_minus_mf: Math.round(cpi_sf - cpi_mf),
      inst_minus_infra: Math.round(cpi_inst - cpi_infra)
    }
  };
}

function scoreMortgage30(x) {
  if (x == null) return 50;
  return clamp(20 + (x - 3.0) * 12);
}
function scoreCurveInversion(dgs2, dgs10) {
  if (dgs2 == null || dgs10 == null) return 50;
  const spread = dgs10 - dgs2;
  return clamp(50 + -spread * 18);
}
function scoreNFCI(n) {
  if (n == null) return 50;
  return clamp(50 + n * 25);
}
function scoreSTLFSI(x) {
  if (x == null) return 50;
  return clamp(35 + x * 15);
}
function scoreOAS(x) {
  if (x == null) return 50;
  return clamp(20 + (x - 1.0) * 12);
}
function scoreSLOOS(x) {
  if (x == null) return 50;
  return clamp(35 + x * 1.0);
}
function scoreMomentum(latest, avgPrev, sensitivity = 60) {
  if (latest == null || avgPrev == null || avgPrev <= 0) return 50;
  const ratio = latest / avgPrev;
  return clamp(50 + (1 - ratio) * sensitivity);
}
function scoreUnemploymentMedian(m) {
  if (m == null) return 50;
  return clamp(30 + (m - 3.5) * 12);
}
function weightedScore(components) {
  const usable = components.filter((c) => c.score != null && Number.isFinite(c.score));
  if (usable.length === 0) return 50;
  const wSum = usable.reduce((a, c) => a + c.weight, 0);
  if (wSum <= 0) return 50;
  return clamp(usable.reduce((a, c) => a + c.score * c.weight, 0) / wSum);
}
function regimeFromCpi(headline, capitalScore, delta3m) {
  const zone = zoneForCpi(headline);
  let modifier = "Neutral";
  if (capitalScore != null && capitalScore >= 80) modifier = "Capital Override";
  else if (delta3m != null && delta3m >= 8) modifier = "Acceleration";
  else if (delta3m != null && delta3m <= -8) modifier = "Relief";
  const confidence = delta3m == null ? "medium" : Math.abs(delta3m) >= 8 ? "high" : "medium";
  return { primary: zone, modifier, confidence };
}
function pulseColor(score) {
  if (score >= 70) return "🔴";
  if (score >= 60) return "🟡";
  return "🟢";
}
function computeEcosystemPulse({ capital, pipeline }) {
  const builders = clamp(0.7 * capital + 0.3 * pipeline);
  const architects = clamp(0.55 * builders + 0.45 * pipeline);
  const gcs = clamp(0.55 * architects + 0.45 * pipeline);
  const distributors = clamp(0.55 * gcs + 0.45 * pipeline);
  const manufacturers = clamp(0.55 * distributors + 0.45 * pipeline);
  return {
    builders: { score: Math.round(builders), state: pulseColor(builders) },
    architects: { score: Math.round(architects), state: pulseColor(architects) },
    general_contractors: { score: Math.round(gcs), state: pulseColor(gcs) },
    distributors: { score: Math.round(distributors), state: pulseColor(distributors) },
    manufacturers: { score: Math.round(manufacturers), state: pulseColor(manufacturers) }
  };
}

// persistence
function readPriorDashboardSafe() {
  try {
    if (!fs.existsSync(OUTFILE)) return null;
    return JSON.parse(fs.readFileSync(OUTFILE, "utf8"));
  } catch {
    return null;
  }
}
function updateRegimeHistory(prior, nextRegime, nextCpi) {
  const today = todayISODate();
  const priorHistory = Array.isArray(prior?.regime_history) ? prior.regime_history : [];
  const last = priorHistory.length ? priorHistory[priorHistory.length - 1] : null;

  const entry = {
    date: today,
    primary_regime: nextRegime.primary,
    secondary_modifier: nextRegime.modifier,
    confidence: nextRegime.confidence,
    cpi_level: nextCpi.headline,
    capital_score: nextCpi.components?.capital ?? null,
    pipeline_score: nextCpi.components?.pipeline ?? null,
    flip_trigger: null,
    duration_days: null,
    status: "Active"
  };

  const history = priorHistory.map((x) => ({ ...x }));
  if (last && last.status === "Active") {
    const changed = last.primary_regime !== entry.primary_regime || last.secondary_modifier !== entry.secondary_modifier;
    if (changed) {
      last.status = "Closed";
      history[history.length - 1] = last;
      entry.flip_trigger = "Regime change";
    }
  }

  if (
    !last ||
    last.status !== "Active" ||
    last.primary_regime !== entry.primary_regime ||
    last.secondary_modifier !== entry.secondary_modifier
  ) {
    history.push(entry);
  }

  const activeIdx = history.findIndex((x) => x.status === "Active");
  if (activeIdx >= 0) {
    const active = history[activeIdx];
    const start = new Date(active.date + "T00:00:00Z").getTime();
    const now = new Date(today + "T00:00:00Z").getTime();
    active.duration_days = Math.max(0, Math.round((now - start) / (1000 * 60 * 60 * 24)));
    history[activeIdx] = active;
  }

  return history;
}

// ---------------------------
// MAIN
// ---------------------------
async function main() {
  const FRED_API_KEY = getEnv("FRED_API_KEY", null);
  const prior = readPriorDashboardSafe();

  const fallbackBps = {
    cbsa: { link: null, permit: new Map() },
    state: { link: null, permit: new Map() }
  };
  const fallbackLaus = {
    stateUnemp: new Map(),
    metroUnemp: new Map(),
    microUnemp: new Map()
  };

  // IMPORTANT FIX: Your screenshot showed FRED 400 for series_id=NAPM.
  // We use NAPMNOI as default (ISM PMI: New Orders Index) which is commonly available.
  // If you want the exact PMI headline series later, we can map it explicitly and validate.
  const FRED_SERIES = {
    mortgage_30y: "MORTGAGE30US",
    cpi_headline: "CPIAUCSL",
    construction_employment: "USCONS",
    total_construction_spending: "TTLCONS",
    housing_starts_total: "HOUST",
    building_permits_total: "PERMIT",
    dgs2_2y_treasury: "DGS2",
    dgs10_10y_treasury: "DGS10",
    baa_corp_yield: "BAA",
    aaa_corp_yield: "AAA",
    hy_oas: "BAMLH0A0HYM2",
    ig_oas: "BAMLC0A0CM",
    nfci: "NFCI",
    anfcI_adjusted: "ANFCI",
    stlfsI: "STLFSI4",
    sloos_ci_large_tightening: "DRTSCILM",
    unrate: "UNRATE",

    // REPLACED FROM NAPM -> NAPMNOI to avoid 400
    ism_pmi: "NAPMNOI",

    nahb_hmi: "HMI"
  };

  // ---- FRED (safe fetch each series)
  const fred = {};
  if (!FRED_API_KEY) {
    console.warn("[warn] Missing FRED_API_KEY; continuing with empty FRED series fallbacks.");
    for (const [k, seriesId] of Object.entries(FRED_SERIES)) {
      fred[k] = {
        series_id: seriesId,
        ok: false,
        error: "Missing FRED_API_KEY",
        latest: null,
        history: []
      };
    }
  } else {
    for (const [k, seriesId] of Object.entries(FRED_SERIES)) {
      fred[k] = await fredSeriesSafe(FRED_API_KEY, seriesId, 48);
    }
  }

  // ---- Census + BLS
  const bps = await loadCensusBpsLatest().catch((err) => {
    console.warn(`[warn] Census BPS unavailable; continuing with fallback data. ${err?.message || err}`);
    return fallbackBps;
  });
  const laus = await loadBlsLausUnempRatesLatest().catch((err) => {
    console.warn(`[warn] BLS LAUS unavailable; continuing with fallback data. ${err?.message || err}`);
    return fallbackLaus;
  });

  const stateNameToFips = buildStateNameToFips();
  const states = Array.from(stateNameToFips.values()).sort();
  const stateUnemps = [];
  for (const fips of states) {
    const u = laus.stateUnemp.get(fips)?.value ?? null;
    if (u != null) stateUnemps.push(u);
  }
  stateUnemps.sort((a, b) => a - b);
  const unempMedian = stateUnemps.length ? stateUnemps[Math.floor(stateUnemps.length / 2)] : null;

  // ---- Capital inputs
  const mortgage30 = latestValue(fred.mortgage_30y);
  const dgs2 = latestValue(fred.dgs2_2y_treasury);
  const dgs10 = latestValue(fred.dgs10_10y_treasury);
  const nfci = latestValue(fred.nfci);
  const anfcI = latestValue(fred.anfcI_adjusted);
  const stlfsi = latestValue(fred.stlfsI);
  const hy = latestValue(fred.hy_oas);
  const ig = latestValue(fred.ig_oas);
  const sloos = latestValue(fred.sloos_ci_large_tightening);
  const baa = latestValue(fred.baa_corp_yield);
  const aaa = latestValue(fred.aaa_corp_yield);
  const baaAaaSpread = baa != null && aaa != null ? baa - aaa : null;

  const capitalScore = Math.round(
    weightedScore([
      { label: "Mortgage 30Y", score: scoreMortgage30(mortgage30), weight: 0.22 },
      { label: "Yield Curve (10y-2y)", score: scoreCurveInversion(dgs2, dgs10), weight: 0.18 },
      { label: "NFCI", score: scoreNFCI(nfci), weight: 0.12 },
      { label: "ANFCI", score: scoreNFCI(anfcI), weight: 0.08 },
      { label: "Financial Stress (STLFSI)", score: scoreSTLFSI(stlfsi), weight: 0.1 },
      { label: "High Yield OAS", score: scoreOAS(hy), weight: 0.12 },
      { label: "IG OAS", score: scoreOAS(ig), weight: 0.06 },
      { label: "SLOOS Tightening", score: scoreSLOOS(sloos), weight: 0.08 },
      { label: "BAA–AAA Spread", score: scoreOAS(baaAaaSpread), weight: 0.04 }
    ])
  );

  // ---- Pipeline inputs
  const permitsLatest = latestValue(fred.building_permits_total);
  const permitsAvgPrev = avgLastN(fred.building_permits_total?.history, 6, 1);
  const startsLatest = latestValue(fred.housing_starts_total);
  const startsAvgPrev = avgLastN(fred.housing_starts_total?.history, 6, 1);

  const pipelineScore = Math.round(
    weightedScore([
      { label: "Permits Momentum", score: scoreMomentum(permitsLatest, permitsAvgPrev, 60), weight: 0.65 },
      { label: "Starts Momentum", score: scoreMomentum(startsLatest, startsAvgPrev, 55), weight: 0.35 }
    ])
  );

  // ---- Trade inputs
  const consEmpLatest = latestValue(fred.construction_employment);
  const consEmpAvgPrev = avgLastN(fred.construction_employment?.history, 6, 1);

  const tradeScore = Math.round(
    weightedScore([
      { label: "State Unemployment Median", score: scoreUnemploymentMedian(unempMedian), weight: 0.65 },
      { label: "Construction Employment Momentum", score: scoreMomentum(consEmpLatest, consEmpAvgPrev, 50), weight: 0.35 }
    ])
  );

  // ---- Macro sentiment
  const unrate = latestValue(fred.unrate);
  const pmi = latestValue(fred.ism_pmi);
  const macroScore = Math.round(
    weightedScore([
      { label: "NFCI", score: scoreNFCI(nfci), weight: 0.45 },
      { label: "Unemployment Rate", score: clamp(30 + (unrate == null ? 0 : (unrate - 3.5) * 10)), weight: 0.3 },
      { label: "ISM proxy (NAPMNOI)", score: clamp(60 - (pmi == null ? 0 : (pmi - 50) * 2)), weight: 0.25 }
    ])
  );

  // ---- USAspending
  const usLimit = safeNumber(getEnv("USASPENDING_LIMIT", "80")) ?? 80;
  const usNaics = parseCsvEnvList(getEnv("USASPENDING_NAICS", "23"));
  const usKeywords = parseCsvEnvList(getEnv("USASPENDING_KEYWORDS", ""));
  const usaspending_windows = await usaspendingRollupsMultiWindow({
    naicsCodes: usNaics,
    keywords: usKeywords,
    limit: usLimit
  });

  // ---- Stocks
  const tickers = normalizeTickerList(getEnv("STOCK_TICKERS", ""));
  const alphaKey = getEnv("ALPHAVANTAGE_API_KEY", null);
  const alphaPriority = normalizeTickerList(getEnv("ALPHAVANTAGE_PRIORITY_TICKERS", ""));
  const stocks = await fetchStockUniverse({ tickers, alphaKey, alphaPriority });
  const sector_rollups = buildSectorRollups(stocks);
  const stock_overlay = computeStockOverlay(sector_rollups);

  // ---- EIA
  const eiaKey = getEnv("EIA_API_KEY", null);
  const eiaSeriesIds = parseCsvEnvList(getEnv("EIA_SERIES_IDS", ""));
  const eiaMaxPoints = safeNumber(getEnv("EIA_MAX_POINTS", "120")) ?? 120;
  const eia = await fetchEiaPack({ apiKey: eiaKey, seriesIds: eiaSeriesIds, maxPoints: eiaMaxPoints });

  const materialsBase = 50;
  const materialsScore = clamp(materialsBase + (eia.energy_overlay || 0), 0, 100);
  const regulatoryScore = 50;

  // ---- NEWS ingestion
  const gdeltLookbackDays = safeNumber(getEnv("NEWS_LOOKBACK_DAYS", "5")) ?? 5;
  const gdeltMax = safeNumber(getEnv("NEWS_MAX", "60")) ?? 60;

  const gdeltQuery =
    '(construction OR "building permits" OR "housing starts" OR "construction spending" OR "architectural billings" OR "general contractor" OR "design-build" OR "building code" OR "land acquisition" OR "pre-construction" OR "master planned community" OR "data center") sourceCountry:US';

  let gdeltNews = [];
  try {
    gdeltNews = await fetchGdeltNews({ query: gdeltQuery, lookbackDays: gdeltLookbackDays, max: gdeltMax });
  } catch {
    gdeltNews = [];
  }

  const NEWS_API_KEY = getEnv("NEWS_API_KEY", getEnv("NEWSAPI_KEY", null));

  const newsApiLookback = safeNumber(getEnv("NEWSAPI_LOOKBACK_DAYS", "10")) ?? 10;
  const newsApiMax = safeNumber(getEnv("NEWSAPI_MAX", "80")) ?? 80;
  const newsApiQuery = getEnv(
    "NEWSAPI_QUERY",
    '(construction OR "building permits" OR "housing starts" OR "construction spending" OR "architectural billings" OR "general contractor" OR "design-build" OR "building code" OR "land acquisition" OR "pre-construction" OR "data center") AND (US OR "United States")'
  );
  const newsApiLang = getEnv("NEWSAPI_LANGUAGE", "en");
  const newsApiSort = getEnv("NEWSAPI_SORTBY", "publishedAt");

  const topHeadlinesEnabled = getEnv("NEWSAPI_TOP_HEADLINES", "false") === "true";
  const topCountry = getEnv("NEWSAPI_COUNTRY", "us");
  const topCategory = getEnv("NEWSAPI_CATEGORY", "business");
  const topPageSize = safeNumber(getEnv("NEWSAPI_PAGE_SIZE", "30")) ?? 30;

  const everythingRes = await fetchNewsApiEverything({
    apiKey: NEWS_API_KEY,
    query: newsApiQuery,
    lookbackDays: newsApiLookback,
    max: newsApiMax,
    language: newsApiLang,
    sortBy: newsApiSort
  });
  const newsEverything = Array.isArray(everythingRes?.items) ? everythingRes.items : [];

  const topRes = topHeadlinesEnabled
    ? await fetchNewsApiTopHeadlines({
        apiKey: NEWS_API_KEY,
        country: topCountry,
        category: topCategory,
        pageSize: topPageSize
      })
    : { enabled: false, items: [] };
  const newsTopHeadlines = Array.isArray(topRes?.items) ? topRes.items : [];

  const mergedNews = mergeAndDedupeNews({
    topHeadlines: newsTopHeadlines,
    premiumEverything: newsEverything,
    gdeltItems: gdeltNews,
    maxOut: 140
  });

  const news_unified = mergedNews.unified;
  const news_sources = mergedNews.counts;

  // ---- Signal Impact Engine (impact scoring + overlay)
  const news_with_impact = news_unified.map((n) => ({
    ...n,
    impact_score: computeSignalImpactScore(n.title),
    themes: classifyNewsItem(n.title)
  }));
  const news_pressure_overlay = computeNewsPressureOverlay(news_with_impact);

  const top_high_impact = news_with_impact
    .slice()
    .sort((a, b) => (b.impact_score ?? 0) - (a.impact_score ?? 0))
    .slice(0, 10);

  const news_clusters = buildNewsClusters(news_with_impact);
  const land_tracker = buildLandTracker(news_with_impact);

  // ---- SAM.gov
  const samKey = getEnv("SAM_API_KEY", null);
  const sam = await fetchSamGovOpportunities({ apiKey: samKey, lookbackDays: 10, max: 50 });

  // ---- CPI overlay application (Capital gets: stocks overlay + news overlay)
  const capitalScoreAdj = clamp(capitalScore + stock_overlay + news_pressure_overlay, 0, 100);

  const cpi = computeCpiEngine({
    capitalScore: capitalScoreAdj,
    pipelineScore,
    tradeScore,
    materialsScore,
    regulatoryScore,
    macroScore
  });

  const priorCpiHist = Array.isArray(prior?.cpi?.history) ? prior.cpi.history : [];
  const cpiHistory = [...priorCpiHist, { date: todayISODate(), value: cpi.headline }].slice(-12);
  const delta3m = computeDelta3mFromHistory(cpiHistory);
  const momentum = momentumBand(delta3m);

  const freezeRisk =
    cpi.headline >= 76 ||
    (capitalScoreAdj >= 80 && pipelineScore >= 70) ||
    (cpi.headline >= 70 && (delta3m ?? 0) >= 10);

  const rtm = cpi.headline >= 70 || (delta3m ?? 0) >= 8 || freezeRisk || capitalScoreAdj >= 80;

  const regime = regimeFromCpi(cpi.headline, capitalScoreAdj, delta3m);
  const ecosystem_pulse = computeEcosystemPulse({ capital: capitalScoreAdj, pipeline: pipelineScore });

  // ---- Trends + Alerts
  const trends = {
    cpi: trendArrow(cpiHistory[cpiHistory.length - 1]?.value, cpiHistory[Math.max(0, cpiHistory.length - 2)]?.value),
    mortgage_30y: trendArrow(mortgage30, prevValue(fred.mortgage_30y, 1)),
    permits: trendArrow(permitsLatest, prevValue(fred.building_permits_total, 1)),
    starts: trendArrow(startsLatest, prevValue(fred.housing_starts_total, 1)),
    nfci: trendArrow(nfci, prevValue(fred.nfci, 1)),
    hy_oas: trendArrow(hy, prevValue(fred.hy_oas, 1))
  };

  const alerts = [];
  if (freezeRisk) {
    alerts.push({
      severity: "CRITICAL",
      symbol: "exclamationmark.triangle.fill",
      title: "Freeze Risk",
      message: "Freeze criteria met. Tighten commitments, protect liquidity, and harden credit posture."
    });
  } else {
    const sev = severityForCpi(cpi.headline);
    if (sev === "ELEVATED")
      alerts.push({
        severity: "ELEVATED",
        symbol: "exclamationmark.circle.fill",
        title: "Elevated Pressure",
        message: "Capital tightening is constraining the pipeline. Protect margin and working capital."
      });
    if (sev === "WATCH")
      alerts.push({
        severity: "WATCH",
        symbol: "eye.fill",
        title: "Watchlist",
        message: "Pressure rising. Monitor capital direction, spreads, permits momentum, and headline impact for confirmation."
      });
  }
  if (stock_overlay >= 10) {
    alerts.push({
      severity: "WATCH",
      symbol: "chart.line.downtrend.xyaxis",
      title: "Equity Weakness Overlay",
      message: "Sector weakness implies forward stress. Treat as temporary capital tightening overlay."
    });
  }
  if (news_pressure_overlay >= 8) {
    alerts.push({
      severity: "WATCH",
      symbol: "newspaper.fill",
      title: "Headline Stress Overlay",
      message: `Signal Impact Engine overlay active (+${news_pressure_overlay}). Treat as temporary capital stress overlay.`
    });
  } else if (news_pressure_overlay >= 5) {
    alerts.push({
      severity: "NORMAL",
      symbol: "newspaper.fill",
      title: "Headline Drift",
      message: `Signal Impact Engine overlay mild (+${news_pressure_overlay}). Monitor confirmation in rates/spreads/permits.`
    });
  }
  if (eia.enabled && (eia.energy_overlay || 0) >= 5) {
    alerts.push({
      severity: "WATCH",
      symbol: "flame.fill",
      title: "Energy Cost Overlay",
      message: "Energy series suggests elevated input-cost pressure. Treat as temporary materials overlay."
    });
  }
  if (NEWS_API_KEY && topHeadlinesEnabled) {
    alerts.push({
      severity: "NORMAL",
      symbol: "sparkles",
      title: "Top Headlines Active",
      message: "NewsAPI Top Headlines is active for executive signal strip."
    });
  }

  // ---- Regime history
  const regime_history = updateRegimeHistory(prior, regime, {
    headline: cpi.headline,
    components: { capital: capitalScoreAdj, pipeline: pipelineScore }
  });
  const activeRegime = regime_history.find((x) => x.status === "Active") || null;
  const prevRegime = [...regime_history].reverse().find((x) => x.status === "Closed") || null;

  const regime_history_display = {
    current_regime_duration_days: activeRegime?.duration_days ?? null,
    previous_regime: prevRegime?.primary_regime ?? null,
    last_flip_date: prevRegime?.date ?? null,
    regime_stability:
      delta3m == null ? "🟡 Watch" : Math.abs(delta3m) <= 3 ? "🟢 Stable" : Math.abs(delta3m) <= 7 ? "🟡 Watch" : "🔴 Fragile"
  };

  // ---- UI contract (Apple-native)
  const ui = {
    accent: "system",
    alerts,
    trends: Object.fromEntries(Object.entries(trends).map(([k, v]) => [k, { arrow: v, symbol: symbolForTrend(v) }])),
    cards: [
      {
        id: "headline_cpi",
        title: "Construction Pressure",
        subtitle: `Headline CPI • ${zoneForCpi(cpi.headline)}`,
        value: cpi.headline,
        trend: trends.cpi,
        symbol: "gauge.with.dots",
        severity: severityForCpi(cpi.headline)
      },
      {
        id: "capital",
        title: "Capital",
        subtitle: `Rates • Credit • Headlines (+${news_pressure_overlay})`,
        value: capitalScoreAdj,
        trend: trends.nfci,
        symbol: "banknote",
        severity: severityForCpi(capitalScoreAdj)
      },
      {
        id: "pipeline",
        title: "Pipeline",
        subtitle: "Permits • Starts",
        value: pipelineScore,
        trend: trends.permits,
        symbol: "building.2",
        severity: severityForCpi(pipelineScore)
      },
      {
        id: "materials",
        title: "Materials & Energy",
        subtitle: "Energy Overlay",
        value: materialsScore,
        trend: "→",
        symbol: "shippingbox.fill",
        severity: severityForCpi(materialsScore)
      }
    ],
    heat_strip: {
      cpi: cpi.headline,
      zone: zoneForCpi(cpi.headline),
      delta_3m: delta3m,
      momentum,
      risk_thermometer_mode: rtm,
      freeze_risk: freezeRisk
    },
    ecosystem_pulse,
    news_badge: { sources: news_sources, total: news_unified.length, overlay: news_pressure_overlay }
  };

  // ---- GPT payload (Construction AI)
  const gpt_payload = {
    product: "Construction AI",
    generated_at_utc: isoUtcNow(),

    regime_history: regime_history_display,
    regime: { primary: regime.primary, modifier: regime.modifier, confidence: regime.confidence },

    cpi: {
      headline: cpi.headline,
      zone: zoneForCpi(cpi.headline),
      delta_3m: delta3m,
      momentum,
      freeze_risk: freezeRisk,
      risk_thermometer_mode: rtm,
      r: cpi.cpi_r,
      i: cpi.cpi_i,
      sf: cpi.cpi_sf,
      mf: cpi.cpi_mf,
      inst: cpi.cpi_inst,
      infra: cpi.cpi_infra,
      divergences: cpi.divergences
    },

    six_pillar: {
      capital: capitalScoreAdj,
      pipeline: pipelineScore,
      trade: tradeScore,
      materials: materialsScore,
      regulatory: 50,
      macro_sentiment: macroScore,
      materials_energy_overlay: eia.energy_overlay || 0,
      stock_overlay,
      news_pressure_overlay
    },

    ecosystem_pulse,

        signal_strip: [
      {
        id: "mortgage_30y",
        title: "Mortgage 30Y",
        direction: trends.mortgage_30y === "↑" ? "up" : trends.mortgage_30y === "↓" ? "down" : "flat",
        state: trends.mortgage_30y === "↑" ? "risk" : trends.mortgage_30y === "↓" ? "relief" : "neutral",
        confidence: "medium",
        value: mortgage30,
        // backward-compatible fields (safe to keep)
        key: "mortgage_30y",
        arrow: trends.mortgage_30y
      },
      {
        id: "permits",
        title: "Building Permits",
        direction: trends.permits === "↑" ? "up" : trends.permits === "↓" ? "down" : "flat",
        state: trends.permits === "↑" ? "growth" : trends.permits === "↓" ? "risk" : "neutral",
        confidence: "medium",
        value: permitsLatest,
        key: "permits",
        arrow: trends.permits
      },
      {
        id: "starts",
        title: "Housing Starts",
        direction: trends.starts === "↑" ? "up" : trends.starts === "↓" ? "down" : "flat",
        state: trends.starts === "↑" ? "growth" : trends.starts === "↓" ? "risk" : "neutral",
        confidence: "medium",
        value: startsLatest,
        key: "starts",
        arrow: trends.starts
      },
      {
        id: "nfci",
        title: "Chicago Fed NFCI",
        direction: trends.nfci === "↑" ? "up" : trends.nfci === "↓" ? "down" : "flat",
        state: trends.nfci === "↑" ? "risk" : trends.nfci === "↓" ? "relief" : "neutral",
        confidence: "medium",
        value: nfci,
        key: "nfci",
        arrow: trends.nfci
      },
      {
        id: "hy_oas",
        title: "High Yield Spread (OAS)",
        direction: trends.hy_oas === "↑" ? "up" : trends.hy_oas === "↓" ? "down" : "flat",
        state: trends.hy_oas === "↑" ? "risk" : trends.hy_oas === "↓" ? "relief" : "neutral",
        confidence: "medium",
        value: hy,
        key: "hy_oas",
        arrow: trends.hy_oas
      }
    ],

    market_intel: {
      stocks: stocks.slice(0, 40),
      sector_rollups,
      stock_pressure_overlay: stock_overlay
    },

    news: {
      sources: news_sources,
      news_pressure_overlay,
      top_high_impact,
      unified: news_with_impact.slice(0, 60),
      clusters: news_clusters,
      land_tracker,
      premium_status: NEWS_API_KEY ? (everythingRes?.error || topRes?.error ? "error" : "active") : "off",
      premium_error: everythingRes?.error || topRes?.error || null
    },

    project_pipeline: {
      sam_gov: sam,
      usaspending: { windows: usaspending_windows }
    },

    energy: eia
  };

  const out = {
    schema_version: "4.4.0",
    generated_at: isoUtcNow(),

    executive: {
      headline: "Construction Intelligence",
      confidence: regime.confidence,
      summary: freezeRisk
        ? "Freeze risk active. Capital tightening is dominant. Shift to defensive posture and protect liquidity."
        : severityForCpi(cpi.headline) === "ELEVATED"
        ? "Pressure elevated. Capital + headline stress are constraining the pipeline."
        : "Pressure stable. Monitor capital direction, spreads, permits, and headline impact for inflection."
    },

    cpi: {
      headline: cpi.headline,
      zone: zoneForCpi(cpi.headline),
      delta_3m: delta3m,
      momentum,
      history: cpiHistory,
      cpi_r: cpi.cpi_r,
      cpi_i: cpi.cpi_i,
      cpi_sf: cpi.cpi_sf,
      cpi_mf: cpi.cpi_mf,
      cpi_inst: cpi.cpi_inst,
      cpi_infra: cpi.cpi_infra,
      divergences: cpi.divergences,
      components: {
        capital: capitalScoreAdj,
        pipeline: pipelineScore,
        trade: tradeScore,
        materials: materialsScore,
        regulatory: 50,
        macro_sentiment: macroScore,
        overlays: { stock_overlay, news_pressure_overlay, energy_overlay: eia.energy_overlay || 0 }
      }
    },

    // keep compatibility with your workflow check
    ceps_score: cpi.headline,

    risk_mode: rtm,
    risk_thermometer_mode: rtm,
    volatility_regime: "NORMAL",

    regime_history,
    regime_history_display,

    ui,

    market_intel: {
      news_sources,
      news_unified: news_unified,
      news_with_impact,
      top_high_impact,
      news_pressure_overlay,
      news_clusters,
      land_tracker,
      stocks,
      sector_rollups,
      stock_pressure_overlay: stock_overlay,
      sam_gov: sam,
      usaspending: { windows: usaspending_windows },
      energy: eia
    },

    gpt_payload,

    observed: {
      sources: {
        fred: { api: "https://api.stlouisfed.org/fred/series/observations" },
        census_bps: {
          state_page: "https://www.census.gov/construction/bps/statemonthly.html",
          cbsa_page: "https://www.census.gov/construction/bps/msamonthly.html",
          selected_state_file: bps.state.link,
          selected_cbsa_file: bps.cbsa.link
        },
        bls_laus: { base: "https://download.bls.gov/pub/time.series/la/" },
        gdelt: { api: "https://api.gdeltproject.org/api/v2/doc/doc" },
        newsapi_everything: { api: "https://newsapi.org/v2/everything", enabled_if_secret_present: true },
        newsapi_top_headlines: { api: "https://newsapi.org/v2/top-headlines", enabled_if_secret_present: true },
        stooq: { api: "https://stooq.com/q/l/" },
        alphavantage: { api: "https://www.alphavantage.co/query" },
        sam_gov: { api: "https://api.sam.gov/opportunities/v2/search" },
        usaspending: { api: "https://api.usaspending.gov/api/v2/award/search/" },
        eia: { api: "https://api.eia.gov" }
      },
      macro_fred: fred
    }
  };

  fs.writeFileSync(OUTFILE, JSON.stringify(out, null, 2), "utf8");
  console.log(`Wrote ${OUTFILE} (Headline CPI=${out.cpi.headline})`);
}
// ---------------------------
// PHASE 2 CPI ENHANCEMENT FLAG
// ---------------------------
const CPI_PHASE = "PHASE_2_ACTIVE";
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
