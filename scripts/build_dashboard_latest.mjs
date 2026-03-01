// scripts/build_dashboard_latest.mjs
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";

const ROOT = path.resolve(process.cwd());
const OUTFILE = path.join(ROOT, process.env.OUT_PATH || "dashboard_latest.json");

// ---------------------------
// Helpers
// ---------------------------
function mustGetEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Connection": "keep-alive",
};

async function fetchText(url) {
  const res = await fetch(url, { redirect: "follow", headers: DEFAULT_HEADERS });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
  return await res.text();
}

async function fetchBuffer(url) {
  const res = await fetch(url, { redirect: "follow", headers: DEFAULT_HEADERS });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

function isoUtcNow() {
  return new Date().toISOString();
}

function clamp(x, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, x));
}

function safeNumber(x) {
  if (x === null || x === undefined) return null;
  if (typeof x === "number") return Number.isFinite(x) ? x : null;
  const s = String(x).replace(/,/g, "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function normalizeCbsa(code) {
  const s = String(code).trim();
  return s.padStart(5, "0");
}

function normalizeAreaNameForJoin(name) {
  if (!name) return null;
  let s = String(name).trim();
  s = s.replace(/\s+Metropolitan Statistical Area$/i, "");
  s = s.replace(/\s+Micropolitan Statistical Area$/i, "");
  s = s.replace(/\s+/g, " ").trim();
  return s.toLowerCase();
}

function parseMonthYear(label) {
  const cleaned = label.replace(/\s+/g, " ").trim();
  const m = cleaned.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!m) return null;
  const monthName = m[1].toLowerCase();
  const year = Number(m[2]);
  const monthMap = {
    january: 0, jan: 0,
    february: 1, feb: 1,
    march: 2, mar: 2,
    april: 3, apr: 3,
    may: 4,
    june: 5, jun: 5,
    july: 6, jul: 6,
    august: 7, aug: 7,
    september: 8, sep: 8, sept: 8,
    october: 9, oct: 9,
    november: 10, nov: 10,
    december: 11, dec: 11,
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

// ---------------------------
// XLSX: choose correct sheet + header row
// ---------------------------
function sheetToRowsWithDetectedHeader(ws, headerMatchers) {
  const preview = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  const maxScan = Math.min(preview.length, 40);

  let headerRowIndex = -1;
  for (let r = 0; r < maxScan; r++) {
    const row = preview[r];
    if (!Array.isArray(row)) continue;

    const cells = row
      .map(v => (v == null ? "" : String(v)).trim().toLowerCase())
      .filter(Boolean);

    if (cells.length < 2) continue;

    const hits = headerMatchers.every(re => cells.some(c => re.test(c)));
    if (hits) {
      headerRowIndex = r;
      break;
    }
  }

  if (headerRowIndex === -1) return null;

  return XLSX.utils.sheet_to_json(ws, {
    defval: null,
    raw: true,
    range: headerRowIndex,
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
    const k = keys.find(x => re.test(x));
    if (k) return k;
  }
  return null;
}

// ---------------------------
// FRED
// ---------------------------
async function fredObservations({ apiKey, seriesId, limit = 36 }) {
  const url = new URL("https://api.stlouisfed.org/fred/series/observations");
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("series_id", seriesId);
  url.searchParams.set("sort_order", "desc");
  url.searchParams.set("limit", String(limit));
  if (process.env.FRED_OBSERVATION_START) {
    url.searchParams.set("observation_start", process.env.FRED_OBSERVATION_START);
  }
  const txt = await fetchText(url.toString());
  const json = JSON.parse(txt);
  return (json.observations || []).map(o => ({
    date: o.date,
    value: safeNumber(o.value),
  }));
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

function trendArrow(curr, prev, eps = 1e-9) {
  if (curr == null || prev == null) return "→";
  if (Math.abs(curr - prev) <= eps) return "→";
  return curr > prev ? "↑" : "↓";
}

function zClip(x, lo, hi) {
  if (x == null) return null;
  return Math.max(lo, Math.min(hi, x));
}

// Deterministic normalizations to 0–100 pressure:
// (Higher score = more pressure/tightness)
function scoreMortgage30(x) {
  // 3% -> ~20, 5.5% -> ~50, 8% -> ~80
  if (x == null) return 50;
  return clamp(20 + (x - 3.0) * 12);
}

function scoreCurveInversion(dgs2, dgs10) {
  // inversion = 2y > 10y increases pressure
  if (dgs2 == null || dgs10 == null) return 50;
  const spread = dgs10 - dgs2; // negative is inverted
  // spread +1.5 -> low pressure, -1.5 -> high pressure
  return clamp(50 + (-spread) * 18);
}

function scoreNFCI(nfci) {
  // NFCI often around -0.5 to +1.0
  if (nfci == null) return 50;
  return clamp(50 + nfci * 25);
}

function scoreSTLFSI(stress) {
  // STLFSI4 typical ~ -1 to +3
  if (stress == null) return 50;
  return clamp(35 + stress * 15);
}

function scoreOAS(oas) {
  // OAS in % points, typical IG ~1–3, HY ~3–10
  if (oas == null) return 50;
  return clamp(20 + (oas - 1.0) * 12);
}

function scoreSLOOS(netPct) {
  // Net % tightening: 0–50+ typical. Higher = tighter credit.
  if (netPct == null) return 50;
  return clamp(35 + netPct * 1.0);
}

function scorePermitsMomentum(latest, avgPrev) {
  if (latest == null || avgPrev == null || avgPrev <= 0) return 50;
  const ratio = latest / avgPrev;
  return clamp(50 + (1 - ratio) * 60);
}

function scoreStartsMomentum(latest, avgPrev) {
  if (latest == null || avgPrev == null || avgPrev <= 0) return 50;
  const ratio = latest / avgPrev;
  return clamp(50 + (1 - ratio) * 55);
}

function scoreUnemploymentMedian(med) {
  // 3.5% -> low pressure, 6.5% -> higher pressure
  if (med == null) return 50;
  return clamp(30 + (med - 3.5) * 12);
}

function scoreConsEmploymentMomentum(latest, avgPrev) {
  if (latest == null || avgPrev == null || avgPrev <= 0) return 50;
  const ratio = latest / avgPrev;
  return clamp(50 + (1 - ratio) * 50);
}

function avgLastN(history, n, excludeLast = 0) {
  if (!Array.isArray(history) || history.length === 0) return null;
  const end = history.length - excludeLast;
  const start = Math.max(0, end - n);
  const slice = history.slice(start, end).map(x => x.value).filter(v => v != null);
  if (slice.length === 0) return null;
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

// ---------------------------
// Census BPS
// ---------------------------
async function loadCensusBpsLatest() {
  const cbsaPage = "https://www.census.gov/construction/bps/msamonthly.html";
  const statePage = "https://www.census.gov/construction/bps/statemonthly.html";

  const cbsaHtml = await fetchText(cbsaPage);
  const stateHtml = await fetchText(statePage);

  const cbsaLink = pickLatestMonthlyExcelLink(cbsaHtml, cbsaPage);
  const stateLink = pickLatestMonthlyExcelLink(stateHtml, statePage);

  if (!cbsaLink) throw new Error("Could not find CBSA monthly excel link on msamonthly.html");
  if (!stateLink) throw new Error("Could not find State monthly excel link on statemonthly.html");

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
    state: { link: stateLink, permit: statePermit },
  };
}

function buildStateNameToFips() {
  const entries = [
    ["Alabama","01"],["Alaska","02"],["Arizona","04"],["Arkansas","05"],["California","06"],
    ["Colorado","08"],["Connecticut","09"],["Delaware","10"],["Florida","12"],["Georgia","13"],
    ["Hawaii","15"],["Idaho","16"],["Illinois","17"],["Indiana","18"],["Iowa","19"],
    ["Kansas","20"],["Kentucky","21"],["Louisiana","22"],["Maine","23"],["Maryland","24"],
    ["Massachusetts","25"],["Michigan","26"],["Minnesota","27"],["Mississippi","28"],["Missouri","29"],
    ["Montana","30"],["Nebraska","31"],["Nevada","32"],["New Hampshire","33"],["New Jersey","34"],
    ["New Mexico","35"],["New York","36"],["North Carolina","37"],["North Dakota","38"],["Ohio","39"],
    ["Oklahoma","40"],["Oregon","41"],["Pennsylvania","42"],["Rhode Island","44"],["South Carolina","45"],
    ["South Dakota","46"],["Tennessee","47"],["Texas","48"],["Utah","49"],["Vermont","50"],
    ["Virginia","51"],["Washington","53"],["West Virginia","54"],["Wisconsin","55"],["Wyoming","56"],
  ];
  const m = new Map();
  for (const [n, f] of entries) m.set(n.toLowerCase(), f);
  return m;
}

// ---------------------------
// BLS LAUS (flat files)
// ---------------------------
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

    if (measure_code !== "03") continue;
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
    { url: base + "la.data.62.Micro", wantSeasonal: "U" },
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
// CEPS v2 (Capital + Pipeline + Trade)
// ---------------------------
function computeCepsV2({ fred, unempStateMedian }) {
  // Capital inputs
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

  const baaAaaSpread = (baa != null && aaa != null) ? (baa - aaa) : null;

  const capital_components = [
    { key: "mortgage_30y", label: "Mortgage 30Y", value: mortgage30, score: scoreMortgage30(mortgage30), weight: 0.22 },
    { key: "curve_inversion", label: "Yield Curve (2y–10y)", value: (dgs2 != null && dgs10 != null) ? (dgs10 - dgs2) : null, score: scoreCurveInversion(dgs2, dgs10), weight: 0.18 },
    { key: "nfci", label: "NFCI", value: nfci, score: scoreNFCI(nfci), weight: 0.12 },
    { key: "anfcI", label: "ANFCI", value: anfcI, score: scoreNFCI(anfcI), weight: 0.08 },
    { key: "stlfsI", label: "Financial Stress (STLFSI)", value: stlfsi, score: scoreSTLFSI(stlfsi), weight: 0.10 },
    { key: "hy_oas", label: "High Yield Spread (OAS)", value: hy, score: scoreOAS(hy), weight: 0.12 },
    { key: "ig_oas", label: "IG Spread (OAS)", value: ig, score: scoreOAS(ig), weight: 0.06 },
    { key: "sloos", label: "Bank Tightening (SLOOS)", value: sloos, score: scoreSLOOS(sloos), weight: 0.08 },
    { key: "baa_aaa_spread", label: "BAA–AAA Spread", value: baaAaaSpread, score: scoreOAS(baaAaaSpread), weight: 0.04 },
  ];

  const capitalScore = weightedScore(capital_components);

  // Pipeline inputs (momentum)
  const permitsLatest = latestValue(fred.building_permits_total);
  const permitsAvgPrev = avgLastN(fred.building_permits_total?.history, 6, 1);
  const startsLatest = latestValue(fred.housing_starts_total);
  const startsAvgPrev = avgLastN(fred.housing_starts_total?.history, 6, 1);

  const pipeline_components = [
    { key: "permits_momentum", label: "Permits Momentum", value: permitsLatest, score: scorePermitsMomentum(permitsLatest, permitsAvgPrev), weight: 0.65 },
    { key: "starts_momentum", label: "Starts Momentum", value: startsLatest, score: scoreStartsMomentum(startsLatest, startsAvgPrev), weight: 0.35 },
  ];

  const pipelineScore = weightedScore(pipeline_components);

  // Trade inputs (labor execution conditions)
  const consEmpLatest = latestValue(fred.construction_employment);
  const consEmpAvgPrev = avgLastN(fred.construction_employment?.history, 6, 1);

  const trade_components = [
    { key: "unemp_median_states", label: "State Unemployment Median", value: unempStateMedian, score: scoreUnemploymentMedian(unempStateMedian), weight: 0.65 },
    { key: "cons_emp_momentum", label: "Construction Employment Momentum", value: consEmpLatest, score: scoreConsEmploymentMomentum(consEmpLatest, consEmpAvgPrev), weight: 0.35 },
  ];

  const tradeScore = weightedScore(trade_components);

  // Headline CEPS v2 (capital dominates)
  const ceps = clamp(0.50 * capitalScore + 0.32 * pipelineScore + 0.18 * tradeScore);

  return {
    ceps_score: Math.round(ceps),
    capital: Math.round(capitalScore),
    pipeline: Math.round(pipelineScore),
    trade: Math.round(tradeScore),
    components: {
      capital: normalizeComponents(capital_components),
      pipeline: normalizeComponents(pipeline_components),
      trade: normalizeComponents(trade_components),
    }
  };
}

function normalizeComponents(arr) {
  return arr.map(x => ({
    key: x.key,
    label: x.label,
    value: x.value,
    score: Math.round(x.score),
    weight: x.weight
  }));
}

function weightedScore(components) {
  const usable = components.filter(c => c.score != null && Number.isFinite(c.score));
  if (usable.length === 0) return 50;

  const wSum = usable.reduce((a, c) => a + c.weight, 0);
  if (wSum <= 0) return 50;

  const s = usable.reduce((a, c) => a + c.score * c.weight, 0) / wSum;
  return clamp(s);
}

function bandForScore(x) {
  if (x >= 76) return "FREEZE_RISK";
  if (x >= 61) return "TIGHTENING";
  if (x >= 46) return "SLOWDOWN";
  if (x >= 31) return "LATE_EXPANSION";
  return "EXPANSION";
}

function severityForScore(x) {
  if (x >= 76) return "CRITICAL";
  if (x >= 70) return "ELEVATED";
  if (x >= 60) return "WATCH";
  return "NORMAL";
}

function symbolForTrend(arrow) {
  if (arrow === "↑") return "arrow.up.right";
  if (arrow === "↓") return "arrow.down.right";
  return "arrow.right";
}

// ---------------------------
// MAIN
// ---------------------------
async function main() {
  const FRED_API_KEY = mustGetEnv("FRED_API_KEY");

  // Full Macro Sweep (construction + macro)
  const FRED_SERIES = {
    // Construction anchors
    mortgage_30y: "MORTGAGE30US",
    cpi_headline: "CPIAUCSL",
    construction_employment: "USCONS",
    total_construction_spending: "TTLCONS",
    housing_starts_total: "HOUST",
    building_permits_total: "PERMIT",

    // Rates / curve / policy
    dgs2_2y_treasury: "DGS2",
    dgs10_10y_treasury: "DGS10",
    dgs30_30y_treasury: "DGS30",
    effr_fed_funds: "EFFR",
    sofr: "SOFR",
    t10yie_breakeven_10y: "T10YIE",

    // Credit / spreads
    baa_corp_yield: "BAA",
    aaa_corp_yield: "AAA",
    hy_oas: "BAMLH0A0HYM2",
    ig_oas: "BAMLC0A0CM",

    // Financial conditions / stress
    nfci: "NFCI",
    anfcI_adjusted: "ANFCI",
    stlfsI: "STLFSI4",

    // Lending standards
    sloos_ci_large_tightening: "DRTSCILM",

    // Macro demand / labor
    unrate: "UNRATE",
    ism_pmi: "NAPM",

    // Housing sentiment (if available)
    nahb_hmi: "HMI",
  };

  const fred = {};
  for (const [k, seriesId] of Object.entries(FRED_SERIES)) {
    const obs = await fredObservations({ apiKey: FRED_API_KEY, seriesId, limit: 36 });
    fred[k] = {
      series_id: seriesId,
      latest: obs[0] ?? null,
      history: obs.slice().reverse(),
    };
  }

  const bps = await loadCensusBpsLatest();
  const laus = await loadBlsLausUnempRatesLatest();

  // Median state unemployment
  const stateNameToFips = buildStateNameToFips();
  const states = Array.from(stateNameToFips.values()).sort();

  const stateUnemps = [];
  for (const fips of states) {
    const u = laus.stateUnemp.get(fips)?.value ?? null;
    if (u != null) stateUnemps.push(u);
  }
  stateUnemps.sort((a, b) => a - b);
  const unempMedian = stateUnemps.length ? stateUnemps[Math.floor(stateUnemps.length / 2)] : null;

  // CEPS v2
  const cepsV2 = computeCepsV2({ fred, unempStateMedian: unempMedian });

  const ceps_score = cepsV2.ceps_score;
  const capIdx = cepsV2.capital;

  const risk_mode = ceps_score >= 70;
  const risk_thermometer_mode = risk_mode;

  // Trends for Apple UI (simple arrows)
  const trends = {
    mortgage_30y: trendArrow(latestValue(fred.mortgage_30y), prevValue(fred.mortgage_30y, 1)),
    permits: trendArrow(latestValue(fred.building_permits_total), prevValue(fred.building_permits_total, 1)),
    starts: trendArrow(latestValue(fred.housing_starts_total), prevValue(fred.housing_starts_total, 1)),
    nfci: trendArrow(latestValue(fred.nfci), prevValue(fred.nfci, 1)),
    hy_oas: trendArrow(latestValue(fred.hy_oas), prevValue(fred.hy_oas, 1)),
  };

  const alerts = [];
  const sev = severityForScore(ceps_score);

  if (sev === "CRITICAL") {
    alerts.push({
      severity: "CRITICAL",
      symbol: "exclamationmark.triangle.fill",
      title: "Freeze Risk",
      message: "Capital and credit conditions indicate elevated freeze probability. Tighten commitments and protect liquidity."
    });
  } else if (sev === "ELEVATED") {
    alerts.push({
      severity: "ELEVATED",
      symbol: "exclamationmark.circle.fill",
      title: "Elevated Pressure",
      message: "Capital conditions are tightening. Focus on backlog quality, credit discipline, and working capital."
    });
  } else if (sev === "WATCH") {
    alerts.push({
      severity: "WATCH",
      symbol: "eye.fill",
      title: "Watchlist",
      message: "Pressure is rising. Monitor mortgage direction, spreads, and permits momentum for confirmation."
    });
  }

  const executiveSummary =
    ceps_score >= 70
      ? "Pressure is elevated. Capital and credit stress are materially constraining the pipeline. Defensive posture recommended."
      : "Pressure is stable. Capital is the primary transmission lever. Monitor permits momentum and credit spreads for inflection.";

  // Drilldown geo layer (unchanged)
  const geo_data = {};
  const observed_gaps = [];

  geo_data["us:US"] = {
    geo: { level: "us", id: "US", name: "United States" },
    capital: { mortgage_30y: fred.mortgage_30y.latest },
    prices: { cpi_headline: fred.cpi_headline.latest },
    labor: { construction_employment: fred.construction_employment.latest },
    residential: {
      permits_total: fred.building_permits_total.latest,
      starts_total: fred.housing_starts_total.latest,
    },
    commercial: { construction_spending_total: fred.total_construction_spending.latest }
  };

  for (const fips of states) {
    const p = bps.state.permit.get(fips) || null;
    const u = laus.stateUnemp.get(fips) || null;
    const nodeKey = `state:${fips}`;

    geo_data[nodeKey] = {
      geo: { level: "state", id: fips, name: p?.name ?? null },
      residential: {
        permits_total: p ? p.total : null,
        permits_sf: p ? p.sf : null,
        permits_mf2p: p ? p.mf2p : null
      },
      labor: { unemployment_rate: u ? u.value : null }
    };

    if (!p) observed_gaps.push({ geo: nodeKey, metric: "bps_state_permits", reason: "no parsed row for this state (sheet/header mismatch)" });
    if (!u) observed_gaps.push({ geo: nodeKey, metric: "laus_state_unemployment_rate", reason: "no state unemployment match (series_id parse)" });
  }

  const cbsas = Array.from(bps.cbsa.permit.keys()).sort();

  for (const cbsa of cbsas) {
    const p = bps.cbsa.permit.get(cbsa);
    const nodeKey = `cbsa:${cbsa}`;

    let unemp = null;
    const norm = normalizeAreaNameForJoin(p?.name);
    if (norm) {
      const candidates = laus.cbsaUnempByNormName.get(norm) || null;
      if (candidates && candidates.length === 1) unemp = candidates[0].value;
    }

    geo_data[nodeKey] = {
      geo: { level: "cbsa", id: cbsa, name: p?.name ?? null },
      residential: {
        permits_total: p ? p.total : null,
        permits_sf: p ? p.sf : null,
        permits_mf2p: p ? p.mf2p : null
      },
      labor: { unemployment_rate: unemp }
    };

    if (unemp == null) observed_gaps.push({ geo: nodeKey, metric: "laus_cbsa_unemployment_rate", reason: "no deterministic LAUS match for this CBSA name" });
  }

  // Apple-native UI “cards” (simple, stable contract)
  const ui_cards = [
    {
      id: "ceps",
      title: "Construction Pressure",
      subtitle: `CEPS v2 • ${bandForScore(ceps_score)}`,
      value: ceps_score,
      trend: "→",
      symbol: "gauge.with.dots",
      severity: severityForScore(ceps_score)
    },
    {
      id: "capital",
      title: "Capital",
      subtitle: "Rates • Credit • Conditions",
      value: cepsV2.capital,
      trend: trends.nfci,
      symbol: "banknote",
      severity: severityForScore(cepsV2.capital)
    },
    {
      id: "pipeline",
      title: "Pipeline",
      subtitle: "Permits • Starts Momentum",
      value: cepsV2.pipeline,
      trend: trends.permits,
      symbol: "building.2",
      severity: severityForScore(cepsV2.pipeline)
    },
    {
      id: "trade",
      title: "Trade",
      subtitle: "Labor Conditions",
      value: cepsV2.trade,
      trend: "→",
      symbol: "person.2",
      severity: severityForScore(cepsV2.trade)
    }
  ];

  const out = {
    schema_version: "3.6.0",
    generated_at: isoUtcNow(),

    executive: {
      headline: "Construction Intelligence",
      confidence: "medium",
      summary: executiveSummary
    },

    // Headline score (keeps your existing workflow gate)
    ceps_score,

    // v2 breakdown (for your iPad UI + future CPI engine)
    ceps_v2: {
      version: "2.0",
      band: bandForScore(ceps_score),
      severity: severityForScore(ceps_score),
      capital: cepsV2.capital,
      pipeline: cepsV2.pipeline,
      trade: cepsV2.trade,
      components: cepsV2.components
    },

    // Existing fields you already use
    ceps_split: {
      residential: clamp(ceps_score - 3, 0, 100),
      institutional: clamp(ceps_score + 3, 0, 100)
    },

    builder_momentum: { value: clamp(Math.round((cepsV2.pipeline + 40) / 2), 0, 100) },

    capital: {
      pressure_index: capIdx,
      band: bandForScore(capIdx),
      subindices: {
        residential: clamp(capIdx + 6, 0, 100),
        institutional: clamp(capIdx - 6, 0, 100)
      },
      history: [{ date: new Date().toISOString().slice(0, 10), value: capIdx }]
    },

    risk_mode,
    risk_thermometer_mode,
    volatility_regime: "NORMAL",

    // Apple design language: calm primitives for SwiftUI
    ui: {
      accent: "system",
      alerts,
      trends: Object.fromEntries(Object.entries(trends).map(([k, v]) => ([k, { arrow: v, symbol: symbolForTrend(v) }]))),
      cards: ui_cards
    },

    observed: {
      sources: {
        fred: { api: "https://api.stlouisfed.org/fred/series/observations" },
        census_bps: {
          state_page: "https://www.census.gov/construction/bps/statemonthly.html",
          cbsa_page: "https://www.census.gov/construction/bps/msamonthly.html",
          selected_state_file: bps.state.link,
          selected_cbsa_file: bps.cbsa.link
        },
        bls_laus: { base: "https://download.bls.gov/pub/time.series/la/" }
      },
      coverage: { us: true, states_fips: states, cbsas },

      // Full macro pack exposed for your iPad dashboard + GPT analytics
      macro_fred: fred,

      geo_data,
      observed_gaps
    }
  };

  fs.writeFileSync(OUTFILE, JSON.stringify(out, null, 2), "utf8");
  console.log(`Wrote ${OUTFILE} (ceps_score=${ceps_score})`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
