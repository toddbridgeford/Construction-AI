// scripts/build_dashboard_latest.mjs
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";

const ROOT = path.resolve(process.cwd());
const OUTFILE = path.join(ROOT, "dashboard_latest.json");

// ---------------------------
// Helpers
// ---------------------------
function mustGetEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

async function fetchText(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
  return await res.text();
}

async function fetchBuffer(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

function isoUtcNow() {
  return new Date().toISOString();
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

    const monthYearRe = /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}/i;
    const match = (inner.match(monthYearRe) || windowText.match(monthYearRe));
    const my = match ? match[0] : null;
    const ts = my ? parseMonthYear(my) : null;

    const abs = href.startsWith("http")
      ? href
      : new URL(href, baseUrl).toString();

    links.push({ url: abs, label: my || inner, ts: ts ?? -1 });
  }

  links.sort((a, b) => (b.ts - a.ts));
  return links[0] || null;
}

function xlsxToRows(buf) {
  const wb = XLSX.read(buf, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(ws, { defval: null, raw: true });
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

  // Strip LAUS suffixes deterministically
  s = s.replace(/\s+Metropolitan Statistical Area$/i, "");
  s = s.replace(/\s+Micropolitan Statistical Area$/i, "");

  // Some area_text strings can include extra commas/spaces; normalize whitespace
  s = s.replace(/\s+/g, " ").trim();
  return s.toLowerCase();
}

// ---------------------------
// FRED
// ---------------------------
async function fredObservations({ apiKey, seriesId, limit = 6 }) {
  const url = new URL("https://api.stlouisfed.org/fred/series/observations");
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("series_id", seriesId);
  url.searchParams.set("sort_order", "desc");
  url.searchParams.set("limit", String(limit));
  const txt = await fetchText(url.toString());
  const json = JSON.parse(txt);
  const obs = (json.observations || []).map(o => ({
    date: o.date,
    value: safeNumber(o.value),
  }));
  return obs;
}

// ---------------------------
// BLS LAUS (flat files)
// ---------------------------
async function loadBlsLausUnempRatesLatest() {
  const base = "https://download.bls.gov/pub/time.series/la/";

  // Series metadata: identify unemployment rate series (measure_code=03)
  const seriesTxt = await fetchText(base + "la.series");
  const unempSeries = new Map(); // series_id -> { area_type_code, area_code, seasonal }

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

  // Area names (area_text join)
  const areaTxt = await fetchText(base + "la.area");
  const areaLines = areaTxt.split("\n").filter(Boolean);
  const areaHeader = areaLines[0].trim().split(/\s+/);
  const aIdx = (name) => areaHeader.indexOf(name);

  const iaType = aIdx("area_type_code");
  const iaCode = aIdx("area_code");
  const iaText = aIdx("area_text");

  const areaTextByTypeCode = new Map(); // `${type}:${code}` -> area_text
  for (let i = 1; i < areaLines.length; i++) {
    const raw = areaLines[i];
    const parts = raw.trim().split(/\s+/);
    if (parts.length < iaText + 1) continue;
    const t = parts[iaType];
    const c = parts[iaCode];
    const text = parts.slice(iaText).join(" ").trim();
    areaTextByTypeCode.set(`${t}:${c}`, text);
  }

  // Data files:
  // - AllStatesS (S, seasonally adjusted)
  // - Metro (U, not seasonally adjusted)
  // - Micro (U, not seasonally adjusted)
  const dataSources = [
    { url: base + "la.data.3.AllStatesS", wantSeasonal: "S" },
    { url: base + "la.data.60.Metro", wantSeasonal: "U" },
    { url: base + "la.data.62.Micro", wantSeasonal: "U" },
  ];

  const latest = new Map(); // series_id -> { key, year, month, value }

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
      const period = parts[isPeriod]; // M01..M12
      if (!/^M\d{2}$/.test(period)) continue;
      const month = Number(period.slice(1));
      const key = year * 100 + month;
      const value = safeNumber(parts[isValue]);

      const prev = latest.get(series_id);
      if (!prev || key > prev.key) {
        latest.set(series_id, { key, year, month, value });
      }
    }
  }

  // State unemployment map (by fips from series_id pattern)
  const stateUnemp = new Map();

  // Metro/micro unemployment by normalized area name (deterministic join target)
  const cbsaUnempByNormName = new Map(); // norm_name -> { value, year, month, series_id, area_text }

  for (const [series_id, obs] of latest.entries()) {
    const meta = unempSeries.get(series_id);
    if (!meta) continue;

    const area_text = areaTextByTypeCode.get(`${meta.area_type_code}:${meta.area_code}`) || null;
    const value = obs.value;

    // States: LAUST{statefips}00000000000003 is common
    const mState = series_id.match(/^LAU[S|U]T(\d{2})00000000000003$/);
    if (mState) {
      stateUnemp.set(mState[1], { value, year: obs.year, month: obs.month, series_id, area_text });
      continue;
    }

    // Metro + micro: key by normalized name, because BPS gives CBSA names
    const norm = normalizeAreaNameForJoin(area_text);
    if (!norm) continue;

    // Collision guard: if two series normalize to same name, keep both and flag later
    const existing = cbsaUnempByNormName.get(norm);
    if (!existing) {
      cbsaUnempByNormName.set(norm, [{ value, year: obs.year, month: obs.month, series_id, area_text }]);
    } else {
      existing.push({ value, year: obs.year, month: obs.month, series_id, area_text });
    }
  }

  let latestRef = null;
  for (const v of stateUnemp.values()) {
    const key = v.year * 100 + v.month;
    if (!latestRef || key > latestRef.key) latestRef = { key, year: v.year, month: v.month };
  }

  return { stateUnemp, cbsaUnempByNormName, latestRef };
}

// ---------------------------
// Census BPS Excel parsing
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

  const cbsaRows = xlsxToRows(cbsaXls);
  const stateRows = xlsxToRows(stateXls);

  function findCol(row, patterns) {
    const keys = Object.keys(row);
    for (const p of patterns) {
      const re = (p instanceof RegExp) ? p : new RegExp(p, "i");
      const k = keys.find(x => re.test(x));
      if (k) return k;
    }
    return null;
  }

  const cbsaPermit = new Map(); // cbsa -> { name, total, sf, mf2p }
  for (const r of cbsaRows) {
    const cbsaCol = findCol(r, [/cbsa/i, /msa/i, /code/i]);
    const nameCol = findCol(r, [/title/i, /name/i, /area/i]);
    if (!cbsaCol) continue;

    const code = safeNumber(r[cbsaCol]);
    if (!code) continue;
    const cbsa = normalizeCbsa(code);
    const name = nameCol ? String(r[nameCol] ?? "").trim() : null;

    const totalCol = findCol(r, [/total\s+units/i, /^total$/i, /total.*perm/i]);
    const sfCol = findCol(r, [/1\s*unit/i, /single\s*family/i, /1-unit/i]);
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

    const totalCol = findCol(r, [/total\s+units/i, /^total$/i, /total.*perm/i]);
    const sfCol = findCol(r, [/1\s*unit/i, /single\s*family/i, /1-unit/i]);
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
  for (const [n,f] of entries) m.set(n.toLowerCase(), f);
  return m;
}

// ---------------------------
// Assemble dashboard_latest.json
// ---------------------------
async function main() {
  const FRED_API_KEY = mustGetEnv("FRED_API_KEY");

  const FRED_SERIES = {
    mortgage_30y: "MORTGAGE30US",
    cpi_headline: "CPIAUCSL",
    construction_employment: "USCONS",
    total_construction_spending: "TTLCONS",
    housing_starts_total: "HOUST",
    building_permits_total: "PERMIT",
  };

  const fred = {};
  for (const [k, seriesId] of Object.entries(FRED_SERIES)) {
    const obs = await fredObservations({ apiKey: FRED_API_KEY, seriesId, limit: 6 });
    fred[k] = {
      series_id: seriesId,
      latest: obs[0] ?? null,
      history: obs.slice().reverse(),
    };
  }

  const bps = await loadCensusBpsLatest();
  const laus = await loadBlsLausUnempRatesLatest();

  const geo_data = {};
  const observed_gaps = [];

  // US node
  geo_data["us:US"] = {
    geo: { level: "us", id: "US", name: "United States" },
    capital: { mortgage_30y: fred.mortgage_30y.latest },
    prices: { cpi_headline: fred.cpi_headline.latest },
    labor: { construction_employment: fred.construction_employment.latest, unemployment_rate: null },
    residential: {
      permits_total: fred.building_permits_total.latest,
      starts_total: fred.housing_starts_total.latest,
      permits_bps_state_cbsa: null,
    },
    commercial: { construction_spending_total: fred.total_construction_spending.latest }
  };

  // State nodes (all 50)
  const states = Array.from(buildStateNameToFips().values()).sort();
  for (const fips of states) {
    const p = bps.state.permit.get(fips) || null;
    const u = laus.stateUnemp.get(fips) || null;

    const nodeKey = `state:${fips}`;
    geo_data[nodeKey] = {
      geo: { level: "state", id: fips, name: p?.name ?? null },
      capital: { mortgage_30y: fred.mortgage_30y.latest },
      labor: {
        unemployment_rate: u ? { date: `${u.year}-${String(u.month).padStart(2,"0")}-01`, value: u.value, series_id: u.series_id } : null
      },
      residential: {
        permits_total: p ? { date: null, value: p.total, units: "units", source: "Census BPS" } : null,
        permits_sf: p ? { date: null, value: p.sf, units: "units", source: "Census BPS" } : null,
        permits_mf2p: p ? { date: null, value: p.mf2p, units: "units", source: "Census BPS" } : null
      },
      commercial: { proxy: null }
    };

    if (!p) observed_gaps.push({ geo: nodeKey, metric: "bps_state_permits", reason: "missing in parsed BPS state file" });
    if (!u) observed_gaps.push({ geo: nodeKey, metric: "laus_state_unemployment_rate", reason: "missing in LAUS AllStatesS latest parse" });
  }

  // Build a deterministic CBSA-name → cbsa_code map from BPS
  const cbsaNameToCode = new Map(); // normalized_name -> [cbsa_codes]
  for (const [cbsa, rec] of bps.cbsa.permit.entries()) {
    const norm = normalizeAreaNameForJoin(rec?.name);
    if (!norm) continue;
    const arr = cbsaNameToCode.get(norm) || [];
    arr.push(cbsa);
    cbsaNameToCode.set(norm, arr);
  }

  // CBSA nodes
  const cbsas = Array.from(bps.cbsa.permit.keys()).sort();
  for (const cbsa of cbsas) {
    const p = bps.cbsa.permit.get(cbsa);
    const nodeKey = `cbsa:${cbsa}`;

    // Deterministic unemployment join:
    // 1) Normalize BPS name
    // 2) Use it to look up LAUS unemployment by normalized area name
    let unemp = null;
    const norm = normalizeAreaNameForJoin(p?.name);
    if (norm) {
      const lausCandidates = laus.cbsaUnempByNormName.get(norm) || null;

      // Guard against LAUS name collisions:
      if (lausCandidates && lausCandidates.length === 1) {
        const v = lausCandidates[0];
        unemp = { date: `${v.year}-${String(v.month).padStart(2,"0")}-01`, value: v.value, series_id: v.series_id };
      } else if (lausCandidates && lausCandidates.length > 1) {
        observed_gaps.push({ geo: nodeKey, metric: "laus_cbsa_unemployment_rate", reason: `LAUS name collision (${lausCandidates.length} series normalize to same area_text)` });
      }
    }

    geo_data[nodeKey] = {
      geo: { level: "cbsa", id: cbsa, name: p?.name ?? null },
      capital: { mortgage_30y: fred.mortgage_30y.latest },
      labor: { unemployment_rate: unemp },
      residential: {
        permits_total: p ? { date: null, value: p.total, units: "units", source: "Census BPS" } : null,
        permits_sf: p ? { date: null, value: p.sf, units: "units", source: "Census BPS" } : null,
        permits_mf2p: p ? { date: null, value: p.mf2p, units: "units", source: "Census BPS" } : null
      },
      commercial: { proxy: null }
    };

    if (!unemp) {
      observed_gaps.push({ geo: nodeKey, metric: "laus_cbsa_unemployment_rate", reason: "no deterministic LAUS match for this CBSA name" });
    }
  }

  const payload = {
    date: new Date().toISOString().slice(0, 10),
    observed_timestamp_utc: isoUtcNow(),
    coverage: {
      us: true,
      states_fips: states,
      cbsas: cbsas,
      msas_default_view: "metro-only filter (derived downstream)"
    },
    sources: {
      fred: {
        api: "https://api.stlouisfed.org/fred/series/observations",
        notes: "National anchors via FRED series observations API."
      },
      census_bps: {
        state_page: "https://www.census.gov/construction/bps/statemonthly.html",
        cbsa_page: "https://www.census.gov/construction/bps/msamonthly.html",
        selected_state_file: bps.state.link,
        selected_cbsa_file: bps.cbsa.link
      },
      bls_laus: {
        base: "https://download.bls.gov/pub/time.series/la/",
        measure_code_unemployment_rate: "03",
        seasonal_codes: { S: "Seasonally Adjusted", U: "Not Seasonally Adjusted" }
      }
    },
    series_pack: { fred_series: FRED_SERIES },
    geo_data,
    observed_gaps
  };

  fs.writeFileSync(OUTFILE, JSON.stringify(payload, null, 2), "utf8");
  console.log(`Wrote ${OUTFILE}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
