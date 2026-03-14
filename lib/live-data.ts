import { IndicatorKey } from '@/types/live-data';
import { getServerEnv } from '@/lib/server/env';

const FRED_SERIES: Record<IndicatorKey, string> = {
  permits: 'PERMIT',
  spending: 'TTLCONS',
  residentialProxy: 'TLRESCONS',
  labor: 'USCONS',
  materials: 'PCU327320327320',
  mortgage: 'MORTGAGE30US'
};

const BLS_SERIES: Partial<Record<IndicatorKey, string>> = {
  labor: 'CES2000000001'
};

const CENSUS_URL = 'https://api.census.gov/data/timeseries/eits/resconst';
const BLS_URL = 'https://api.bls.gov/publicAPI/v2/timeseries/data/';
const FRED_URL = 'https://api.stlouisfed.org/fred/series/observations';
const EIA_URL = 'https://api.eia.gov/v2/electricity/retail-sales/data/';

export type RawPoint = { date: string; value: number };
export type SourceFamily = 'Census' | 'BLS' | 'FRED' | 'EIA' | 'Stub';

export type LiveSeriesResponse = {
  indicator: IndicatorKey;
  source: SourceFamily;
  geography: string;
  referencePeriod: string;
  points: RawPoint[];
  isLive: boolean;
  note?: string;
};

const parseFloatSafe = (value: string | number | null | undefined) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toMonthDate = (year: string, period: string) => {
  const month = period.replace('M', '').padStart(2, '0');
  return `${year}-${month}-01`;
};

export async function fetchFredSeries(indicator: IndicatorKey): Promise<LiveSeriesResponse> {
  const { env, isValid } = getServerEnv();
  if (!isValid || !env.FRED_API_KEY) {
    throw new Error('Missing FRED_API_KEY.');
  }

  const params = new URLSearchParams({
    series_id: FRED_SERIES[indicator],
    api_key: env.FRED_API_KEY,
    file_type: 'json',
    observation_start: '2023-01-01'
  });

  const response = await fetch(`${FRED_URL}?${params.toString()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`FRED request failed with ${response.status}`);

  const payload = await response.json();
  const observations = payload?.observations as Array<{ date: string; value: string }> | undefined;
  const points = (observations ?? [])
    .map((item) => {
      const value = parseFloatSafe(item.value);
      if (!item.date || value === null || item.value === '.') return null;
      return { date: item.date, value };
    })
    .filter((point): point is RawPoint => point !== null);

  return {
    indicator,
    source: 'FRED',
    geography: 'US',
    referencePeriod: points.at(-1)?.date ?? 'N/A',
    points,
    isLive: points.length > 0
  };
}

export async function fetchBlsSeries(indicator: IndicatorKey): Promise<LiveSeriesResponse | null> {
  const seriesId = BLS_SERIES[indicator];
  if (!seriesId) return null;

  const { env, isValid } = getServerEnv();
  if (!isValid || !env.BLS_API_KEY) {
    throw new Error('Missing BLS_API_KEY.');
  }

  const response = await fetch(BLS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      seriesid: [seriesId],
      startyear: '2023',
      endyear: String(new Date().getFullYear()),
      registrationkey: env.BLS_API_KEY
    }),
    cache: 'no-store'
  });
  if (!response.ok) throw new Error(`BLS request failed with ${response.status}`);

  const payload = await response.json();
  const series = payload?.Results?.series?.[0]?.data as Array<{ year: string; period: string; value: string }> | undefined;
  if (!series?.length) return null;

  const points = series
    .filter((item) => item.period?.startsWith('M') && item.period !== 'M13')
    .map((item) => {
      const value = parseFloatSafe(item.value);
      if (value === null) return null;
      return { date: toMonthDate(item.year, item.period), value };
    })
    .filter((point): point is RawPoint => point !== null)
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    indicator,
    source: 'BLS',
    geography: 'US',
    referencePeriod: points.at(-1)?.date ?? 'N/A',
    points,
    isLive: points.length > 0
  };
}

export async function fetchCensusPermitsSeries(): Promise<LiveSeriesResponse | null> {
  const { env, isValid } = getServerEnv();
  if (!isValid || !env.CENSUS_API_KEY) {
    throw new Error('Missing CENSUS_API_KEY.');
  }

  const params = new URLSearchParams({
    get: 'cell_value,time_slot_id',
    for: 'us:1',
    category_code: 'TBPRIV',
    data_type_code: '1',
    seasonally_adj: 'yes',
    time: 'from 2023-01',
    key: env.CENSUS_API_KEY
  });

  const response = await fetch(`${CENSUS_URL}?${params.toString()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Census request failed with ${response.status}`);

  const payload = (await response.json()) as string[][];
  if (!Array.isArray(payload) || payload.length < 2) return null;

  const [header, ...rows] = payload;
  const valueIndex = header.indexOf('cell_value');
  const dateIndex = header.indexOf('time_slot_id');
  if (valueIndex < 0 || dateIndex < 0) return null;

  const points = rows
    .map((row) => {
      const value = parseFloatSafe(row[valueIndex]);
      const date = row[dateIndex];
      if (value === null || !date) return null;
      return { date: `${date}-01`, value };
    })
    .filter((point): point is RawPoint => point !== null)
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    indicator: 'permits',
    source: 'Census',
    geography: 'US',
    referencePeriod: points.at(-1)?.date ?? 'N/A',
    points,
    isLive: points.length > 0
  };
}

export async function fetchEiaMaterialsSeries(): Promise<LiveSeriesResponse | null> {
  const { env, isValid } = getServerEnv();
  if (!isValid || !env.EIA_API_KEY) {
    throw new Error('Missing EIA_API_KEY.');
  }

  const params = new URLSearchParams({
    'api_key': env.EIA_API_KEY,
    'frequency': 'monthly',
    'data[0]': 'price',
    'facets[sectorid][]': 'RES',
    'sort[0][column]': 'period',
    'sort[0][direction]': 'asc',
    'offset': '0',
    'length': '120'
  });

  const response = await fetch(`${EIA_URL}?${params.toString()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`EIA request failed with ${response.status}`);

  const payload = await response.json();
  const rows = payload?.response?.data as Array<{ period: string; price: number | string }> | undefined;
  if (!rows?.length) return null;

  const points = rows
    .map((row) => {
      const value = parseFloatSafe(row.price);
      const date = row.period;
      if (value === null || !date) return null;
      const normalizedDate = /^\d{4}-\d{2}$/.test(date) ? `${date}-01` : `${date.slice(0, 4)}-${date.slice(4, 6)}-01`;
      return { date: normalizedDate, value };
    })
    .filter((point): point is RawPoint => point !== null)
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    indicator: 'materials',
    source: 'EIA',
    geography: 'US',
    referencePeriod: points.at(-1)?.date ?? 'N/A',
    points,
    isLive: points.length > 0
  };
}

const FIPS_TO_STATE: Record<string, string> = {
  '01': 'AL','02': 'AK','04': 'AZ','05': 'AR','06': 'CA','08': 'CO','09': 'CT','10': 'DE','11': 'DC','12': 'FL','13': 'GA',
  '15': 'HI','16': 'ID','17': 'IL','18': 'IN','19': 'IA','20': 'KS','21': 'KY','22': 'LA','23': 'ME','24': 'MD','25': 'MA',
  '26': 'MI','27': 'MN','28': 'MS','29': 'MO','30': 'MT','31': 'NE','32': 'NV','33': 'NH','34': 'NJ','35': 'NM','36': 'NY',
  '37': 'NC','38': 'ND','39': 'OH','40': 'OK','41': 'OR','42': 'PA','44': 'RI','45': 'SC','46': 'SD','47': 'TN','48': 'TX',
  '49': 'UT','50': 'VT','51': 'VA','53': 'WA','54': 'WV','55': 'WI','56': 'WY'
};

export async function fetchStateMapValues(indicator: IndicatorKey): Promise<Record<string, number> | null> {
  if (indicator !== 'permits') return null;

  const { env, isValid } = getServerEnv();
  if (!isValid || !env.CENSUS_API_KEY) {
    throw new Error('Missing CENSUS_API_KEY.');
  }

  const params = new URLSearchParams({
    get: 'cell_value,state',
    for: 'state:*',
    category_code: 'TBPRIV',
    data_type_code: '1',
    seasonally_adj: 'yes',
    time: 'latest',
    key: env.CENSUS_API_KEY
  });

  const response = await fetch(`${CENSUS_URL}?${params.toString()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Census state request failed with ${response.status}`);

  const payload = (await response.json()) as string[][];
  if (!Array.isArray(payload) || payload.length < 2) return null;

  const [header, ...rows] = payload;
  const valueIndex = header.indexOf('cell_value');
  const stateIndex = header.indexOf('state');
  if (valueIndex < 0 || stateIndex < 0) return null;

  const out: Record<string, number> = {};
  for (const row of rows) {
    const code = FIPS_TO_STATE[row[stateIndex]];
    const value = parseFloatSafe(row[valueIndex]);
    if (!code || value === null) continue;
    out[code] = value;
  }

  return Object.keys(out).length ? out : null;
}

export async function fetchIndicatorSeries(indicator: IndicatorKey): Promise<LiveSeriesResponse> {
  try {
    if (indicator === 'permits') {
      const census = await fetchCensusPermitsSeries();
      if (census?.points.length) return census;
    }

    if (indicator === 'materials') {
      const eia = await fetchEiaMaterialsSeries();
      if (eia?.points.length) return eia;
    }

    const bls = await fetchBlsSeries(indicator);
    if (bls?.points.length) return bls;

    const fred = await fetchFredSeries(indicator);
    if (fred.points.length) return fred;
  } catch (error) {
    return {
      indicator,
      source: 'Stub',
      geography: 'US',
      referencePeriod: 'N/A',
      points: [],
      isLive: false,
      note: error instanceof Error ? error.message : 'Live source unavailable'
    };
  }

  return {
    indicator,
    source: 'Stub',
    geography: 'US',
    referencePeriod: 'N/A',
    points: [],
    isLive: false,
    note: 'No live data returned for this indicator.'
  };
}
