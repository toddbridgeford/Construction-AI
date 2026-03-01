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

// ---------------------------
// FRED
// ---------------------------
async function fredObservations({ apiKey, seriesId, limit = 24 }) {
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
  const obs = (json.observations || []).map(o => ({
    date: o.date,
    value: safeNumber(o.value),
  }));
  return obs;
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

  const cbsaPermit = new Map();
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
// BLS LAUS
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
      if (!prev || key > prev.key) {
        latest.set(series_id, { key, year, month, value });
      }
    }
  }

  const stateUnemp = new Map();
  const cbsaUnempByNormName = new Map();

  for (const [series_id, obs] of latest.entries()) {
    const meta = unempSeries.get(series_id);
    if (!meta) continue;

    const area_text = areaTextByTypeCode.get(`${meta.area_type_code}:${meta.area_code}`) || null;

    const mState = series_id.match(/^LAU[S|U]T(\d{2})00000000000003$/);
    if (mState) {
      stateUnemp.set(mState[1], { value: obs.value, year: obs.year, month: obs.month, series_id, area_text });
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
// CEPS (deterministic, observed-only)
// ---------------------------
function computeCeps({ mortgage30, permits, permitsHistory, unempStateMedian }) {
  // Capital: mortgage rate pressure (centered ~5.5%; higher = more pressure)
  const capital = mortgage30 == null ? 50 : clamp(50 + (mortgage30 - 5.5) * 12);

  // Pipeline: permits momentum (latest vs average of previous 6 points if available)
  let pipeline = 50;
  if (permits != null && Array.isArray(permitsHistory) && permitsHistory.length >= 8) {
    const hist = permitsHistory.slice(-7, -1).map(x => x.value).filter(v => v != null);
    if (hist.length >= 3) {
      const avg = hist.reduce((a,b)=>a+b,0) / hist.length;
      // if permits below avg => higher pressure
      const ratio = avg > 0 ? permits / avg : 1;
      pipeline = clamp(50 + (1 - ratio) * 60); // strong sensitivity
    }
  }

  // Trade: unemployment median (higher unemp = higher slowdown pressure)
  const trade = unempStateMedian == null ? 50 : clamp(40 + (unempStateMedian - 4.0) * 10);

  // CEPS: weighted
  const ceps = clamp(0.45 * capital + 0.35 * pipeline + 0.20 * trade);
  return {
    ceps_score: Math.round(ceps),
    capital: Math.round(capital),
    pipeline: Math.round(pipeline),
    trade: Math.round(trade),
  };
}

function bandForScore(x) {
  if (x >= 76) return "FREEZE_RISK";
  if (x >= 61) return "TIGHTENING";
  if (x >= 46) return "SLOWDOWN";
  if (x >= 31) return "LATE_EXPANSION";
  return "EXPANSION";
}

// ---------------------------
// MAIN
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
    const obs = await fredObservations({ apiKey: FRED_API_KEY, seriesId, limit: 24 });
    fred[k] = {
      series_id: seriesId,
      latest: obs[0] ?? null,
      history: obs.slice().reverse(), // oldest->newest
    };
  }

  const bps = await loadCensusBpsLatest();
  const laus = await loadBlsLausUnempRatesLatest();

  // Build expanded geo_data for drilldown
  const geo_data = {};
  const observed_gaps = [];

  // US node (observed anchors)
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

  // State nodes (permits + unemployment)
  const stateNameToFips = buildStateNameToFips();
  const states = Array.from(stateNameToFips.values()).sort();
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
      labor: {
        unemployment_rate: u ? u.value : null
      }
    };

    if (!p) observed_gaps.push({ geo: nodeKey, metric: "bps_state_permits", reason: "missing in parsed BPS state file" });
    if (!u) observed_gaps.push({ geo: nodeKey, metric: "laus_state_unemployment_rate", reason: "missing in LAUS AllStatesS latest parse" });
  }

  // CBSA nodes (permits + deterministic unemployment join by normalized name)
  const cbsas = Array.from(bps.cbsa.permit.keys()).sort();
  for (const cbsa of cbsas) {
    const p = bps.cbsa.permit.get(cbsa);
    const nodeKey = `cbsa:${cbsa}`;

    let unemp = null;
    const norm = normalizeAreaNameForJoin(p?.name);
    if (norm) {
      const candidates = laus.cbsaUnempByNormName.get(norm) || null;
      if (candidates && candidates.length === 1) {
        unemp = candidates[0].value;
      }
    }

    geo_data[nodeKey] = {
      geo: { level: "cbsa", id: cbsa, name: p?.name ?? null },
      residential: {
        permits_total: p ? p.total : null,
        permits_sf: p ? p.sf : null,
        permits_mf2p: p ? p.mf2p : null
      },
      labor: {
        unemployment_rate: unemp
      }
    };

    if (unemp == null) {
      observed_gaps.push({ geo: nodeKey, metric: "laus_cbsa_unemployment_rate", reason: "no deterministic LAUS match for this CBSA name" });
    }
  }

  // CEPS computation inputs (observed-only)
  const mortgageLatest = fred.mortgage_30y.latest?.value ?? null;
  const permitsLatest = fred.building_permits_total.latest?.value ?? null;
  const permitsHist = fred.building_permits_total.history ?? [];

  // Median state unemployment (ignores nulls)
  const stateUnemps = [];
  for (const fips of states) {
    const u = laus.stateUnemp.get(fips)?.value ?? null;
    if (u != null) stateUnemps.push(u);
  }
  stateUnemps.sort((a,b)=>a-b);
  const unempMedian = stateUnemps.length
    ? stateUnemps[Math.floor(stateUnemps.length / 2)]
    : null;

  const cepsParts = computeCeps({
    mortgage30: mortgageLatest,
    permits: permitsLatest,
    permitsHistory: permitsHist,
    unempStateMedian: unempMedian
  });

  const ceps_score = cepsParts.ceps_score;
  const capIdx = cepsParts.capital;

  const risk_mode = ceps_score >= 70;
  const risk_thermometer_mode = risk_mode;

  // Minimal executive summary (calm, deterministic)
  const executiveSummary =
    ceps_score >= 70
      ? "Pressure is elevated. Capital and pipeline signals warrant defensive posture and tighter risk controls."
      : "Pressure is stable. Monitor capital and residential permits for early inflection signals.";

  const out = {
    schema_version: "3.4.0",
    generated_at: isoUtcNow(),

    executive: {
      headline: "Construction Intelligence",
      confidence: "medium",
      summary: executiveSummary
    },

    ceps_score,
    ceps_split: {
      residential: clamp(ceps_score - 3, 0, 100),
      institutional: clamp(ceps_score + 3, 0, 100)
    },

    builder_momentum: { value: clamp(Math.round((cepsParts.pipeline + 40) / 2), 0, 100) },

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

    // Expanded observed drilldown layer (National → State → CBSA)
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
      coverage: {
        us: true,
        states_fips: states,
        cbsas
      },
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
