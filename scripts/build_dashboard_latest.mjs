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
  // label like "December 2025" or "Jan 2026"
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
  // We look for anchor tags pointing to .xls/.xlsx and whose visible text or nearby text contains Month YYYY.
  // Census pages are consistent enough that selecting the highest Month-Year found usually works.
  const links = [];

  // crude anchor scan
  const anchorRe = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = anchorRe.exec(html))) {
    const href = m[1];
    const inner = m[2].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    if (!/\.xls(x)?(\?|$)/i.test(href)) continue;

    // Find a Month YYYY either in anchor text, or in the surrounding HTML chunk
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

  // Prefer true month-year timestamps, otherwise fallback to first xls link.
  links.sort((a, b) => (b.ts - a.ts));
  return links[0] || null;
}

function xlsxToRows(buf) {
  const wb = XLSX.read(buf, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  // defval keeps empty cells present
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

function normalizeStateFips(two) {
  const s = String(two).trim();
  return s.padStart(2, "0");
}

function normalizeCbsa(code) {
  const s = String(code).trim();
  return s.padStart(5, "0");
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
// We use download.bls.gov LAUS time series files, filtered by measure_code=03 (unemployment rate)
// measure_code definitions are published in la.measure.  [oai_citation:5‡download.bls.gov](https://download.bls.gov/pub/time.series/la/la.measure)
async function loadBlsLausUnempRatesLatest() {
  const base = "https://download.bls.gov/pub/time.series/la/";

  // Series metadata: to know which series IDs correspond to unemployment rate (measure_code 03)
  const seriesTxt = await fetchText(base + "la.series");

  // Seasonal codes: S seasonally adjusted, U not seasonally adjusted.  [oai_citation:6‡download.bls.gov](https://download.bls.gov/pub/time.series/la/la.seasonal?utm_source=chatgpt.com)
  // We'll choose:
  // - States: seasonal=S
  // - Metro & Micro: seasonal=U (BLS commonly publishes metro area rates not seasonally adjusted)
  const unempSeries = new Map(); // series_id -> { area_type_code, area_code, seasonal }

  const lines = seriesTxt.split("\n").filter(Boolean);
  // header: series_id area_type_code area_code measure_code seasonal srd_code ...
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

  // Area names
  const areaTxt = await fetchText(base + "la.area");
  const areaLines = areaTxt.split("\n").filter(Boolean);
  const areaHeader = areaLines[0].trim().split(/\s+/);
  const aIdx = (name) => areaHeader.indexOf(name);

  const iaType = aIdx("area_type_code");
  const iaCode = aIdx("area_code");
  const iaText = aIdx("area_text");

  const areaName = new Map(); // `${type}:${code}` -> name
  for (let i = 1; i < areaLines.length; i++) {
    const raw = areaLines[i];
    // area_text may contain spaces; it's last column onwards
    const parts = raw.trim().split(/\s+/);
    if (parts.length < iaText + 1) continue;
    const t = parts[iaType];
    const c = parts[iaCode];
    const text = parts.slice(iaText).join(" ").trim();
    areaName.set(`${t}:${c}`, text);
  }

  // Data files for latest values:
  // - AllStatesS (seasonally adjusted states)  [oai_citation:7‡download.bls.gov](https://download.bls.gov/pub/time.series/la/)
  // - Metro (not seasonally adjusted metros)  [oai_citation:8‡download.bls.gov](https://download.bls.gov/pub/time.series/la/)
  // - Micro (not seasonally adjusted micros)  [oai_citation:9‡download.bls.gov](https://download.bls.gov/pub/time.series/la/)
  const dataSources = [
    { url: base + "la.data.3.AllStatesS", wantSeasonal: "S" },
    { url: base + "la.data.60.Metro", wantSeasonal: "U" },
    { url: base + "la.data.62.Micro", wantSeasonal: "U" },
  ];

  // Parse each file and take the latest (max year+period) for each series
  const latest = new Map(); // series_id -> { year, period, value }

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
      const period = parts[isPeriod]; // e.g., "M12"
      if (!/^M\d{2}$/.test(period)) continue;
      const month = Number(period.slice(1));
      const key = year * 100 + month;
      const value = safeNumber(parts[isValue]);

      const prev = latest.get(series_id);
      if (!prev || key > prev.key) {
        latest.set(series_id, { key, year, month, period, value });
      }
    }
  }

  // Build outputs:
  // States map: state_fips -> unemployment_rate
  // CBSA map: cbsa_code -> unemployment_rate (for metros/micros where present)
  const stateUnemp = new Map();
  const cbsaUnemp = new Map();

  for (const [series_id, obs] of latest.entries()) {
    const meta = unempSeries.get(series_id);
    if (!meta) continue;

    const name = areaName.get(`${meta.area_type_code}:${meta.area_code}`) || null;

    // Heuristic mapping:
    // - State series IDs include "LASST" prefix (example seen in la.series snippets)  [oai_citation:10‡download.bls.gov](https://download.bls.gov/pub/time.series/la/la.series?utm_source=chatgpt.com)
    // - Metro/micro often include other area codes.
    // We'll map by area_type_code:
    //  "A" is used in la.series for state-like entries (from snippets), and metro/micro differ.
    // Instead of relying on codes we don't want to guess, we store by name and keep ID.
    // For v1 we:
    //  - if name matches a state name exactly, map to state via a lookup later (done below)
    //  - if name ends with "Metropolitan Statistical Area" or "Micropolitan Statistical Area", store as CBSA by extracting leading numeric from area_code when possible.
    const value = obs.value;

    // State mapping: state area_code usually begins with state FIPS (e.g., "08...").
    // For AllStatesS file, series_id typically LAUST{statefips}0000000000003 (common pattern; see BLS ID format docs).  [oai_citation:11‡Bureau of Labor Statistics](https://www.bls.gov/help/hlpforma.htm?utm_source=chatgpt.com)
    const mState = series_id.match(/^LAU[S|U]T(\d{2})00000000000003$/);
    if (mState) {
      stateUnemp.set(mState[1], { value, year: obs.year, month: obs.month, series_id, name });
      continue;
    }

    // Metro/Micro mapping: BLS metro IDs often look like LAU[U|S]T? / LAU? with embedded area codes.
    // We will not guess CBSA from series_id; instead we keep a name-keyed map and later join to CBSA names from BPS file.
    cbsaUnemp.set(series_id, { value, year: obs.year, month: obs.month, series_id, name });
  }

  // Determine the latest reference month from any state observation
  let latestRef = null;
  for (const v of stateUnemp.values()) {
    const key = v.year * 100 + v.month;
    if (!latestRef || key > latestRef.key) latestRef = { key, year: v.year, month: v.month };
  }

  return { stateUnemp, cbsaUnempBySeriesId: cbsaUnemp, latestRef };
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

  // The Census BPS Excel layouts can vary slightly.
  // We’ll detect key columns by name-insensitive matching.
  function findCol(row, patterns) {
    const keys = Object.keys(row);
    for (const p of patterns) {
      const re = (p instanceof RegExp) ? p : new RegExp(p, "i");
      const k = keys.find(x => re.test(x));
      if (k) return k;
    }
    return null;
  }

  // CBSA: expect columns like "CBSA", "CBSA Code", "Metropolitan Area", "Name", and permit unit totals (1-unit, 2+ units, total).
  const cbsaPermit = new Map(); // cbsa -> { name, total, sf, mf2p, monthLabel }

  for (const r of cbsaRows) {
    const cbsaCol = findCol(r, [/cbsa/i, /msa/i, /code/i]);
    const nameCol = findCol(r, [/title/i, /name/i, /area/i]);
    if (!cbsaCol) continue;

    const code = safeNumber(r[cbsaCol]);
    if (!code) continue;
    const cbsa = normalizeCbsa(code);
    const name = nameCol ? String(r[nameCol] ?? "").trim() : null;

    // permit columns: try common patterns
    const totalCol = findCol(r, [/total\s+units/i, /^total$/i, /total.*perm/i]);
    const sfCol = findCol(r, [/1\s*unit/i, /single\s*family/i, /1-unit/i]);
    const mfCol = findCol(r, [/2\+?\s*units/i, /multi/i, /2\+ units/i]);

    const total = totalCol ? safeNumber(r[totalCol]) : null;
    const sf = sfCol ? safeNumber(r[sfCol]) : null;
    const mf2p = mfCol ? safeNumber(r[mfCol]) : null;

    // only store if it looks like a data row
    if (total === null && sf === null && mf2p === null) continue;

    cbsaPermit.set(cbsa, { name, total, sf, mf2p });
  }

  // State: columns usually include state name and units totals
  const statePermit = new Map(); // fips2 -> { name, total, sf, mf2p }
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
  // 50 states only (no territories) as you requested.
  // Deterministic mapping; avoids dependencies.
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

  // 1) National anchors (FRED)
  // (You can adjust series IDs anytime; these are stable and commonly used.)
  const FRED_SERIES = {
    mortgage_30y: "MORTGAGE30US",
    cpi_headline: "CPIAUCSL",
    construction_employment: "USCONS",  // All Employees: Construction (FRED)
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
      history: obs.slice().reverse(), // oldest->newest
    };
  }

  // 2) Census BPS permits (State + CBSA)
  const bps = await loadCensusBpsLatest();

  // 3) BLS LAUS unemployment rates (State + Metro + Micro) from flat files
  const laus = await loadBlsLausUnempRatesLatest();

  // 4) Build geo_data
  const geo_data = {};
  const observed_gaps = [];

  // US node
  geo_data["us:US"] = {
    geo: { level: "us", id: "US", name: "United States" },
    capital: {
      mortgage_30y: fred.mortgage_30y.latest,
    },
    prices: {
      cpi_headline: fred.cpi_headline.latest,
    },
    labor: {
      construction_employment: fred.construction_employment.latest,
      unemployment_rate: null, // optional; can add later
    },
    residential: {
      permits_total: fred.building_permits_total.latest,
      starts_total: fred.housing_starts_total.latest,
      permits_bps_state_cbsa: null, // US aggregate from BPS file could be added later if desired
    },
    commercial: {
      construction_spending_total: fred.total_construction_spending.latest,
    }
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
      commercial: {
        // v1 proxy: state commercial pipeline is not directly measured here; keep null and let OS stay Structural for that component
        proxy: null
      }
    };

    if (!p) observed_gaps.push({ geo: nodeKey, metric: "bps_state_permits", reason: "missing in parsed BPS state file" });
    if (!u) observed_gaps.push({ geo: nodeKey, metric: "laus_state_unemployment_rate", reason: "missing in LAUS AllStatesS latest parse" });
  }

  // CBSA nodes: use BPS CBSA permits as the CBSA universe
  const cbsas = Array.from(bps.cbsa.permit.keys()).sort();
  for (const cbsa of cbsas) {
    const p = bps.cbsa.permit.get(cbsa);
    const nodeKey = `cbsa:${cbsa}`;

    geo_data[nodeKey] = {
      geo: { level: "cbsa", id: cbsa, name: p?.name ?? null },
      capital: { mortgage_30y: fred.mortgage_30y.latest },
      labor: {
        // Joining LAUS metro/micro unemployment to CBSA deterministically requires a shared key.
        // In v1 expanded we keep this as "gap" and add a v1.1 join step once we lock a stable mapping.
        unemployment_rate: null
      },
      residential: {
        permits_total: p ? { date: null, value: p.total, units: "units", source: "Census BPS" } : null,
        permits_sf: p ? { date: null, value: p.sf, units: "units", source: "Census BPS" } : null,
        permits_mf2p: p ? { date: null, value: p.mf2p, units: "units", source: "Census BPS" } : null
      },
      commercial: {
        proxy: null
      }
    };

    // We intentionally mark CBSA unemployment as gap in v1, because mapping series_id→CBSA needs a stable join.
    observed_gaps.push({ geo: nodeKey, metric: "laus_cbsa_unemployment_rate", reason: "join step deferred to v1.1 (deterministic mapping required)" });
  }

  // 5) Coverage & provenance
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
    series_pack: {
      fred_series: FRED_SERIES
    },
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
