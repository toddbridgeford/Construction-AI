'use client';

import React, { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type StatePoint = { code: string; lat: number; lon: number };
type GeographyLevel = 'US' | 'Region' | 'State' | 'City/Metro';
type DateRange = '1M' | '3M' | '6M' | '1Y' | '3Y' | '5Y' | 'YTD';
type IndicatorKey = 'permits' | 'spending' | 'residentialProxy' | 'labor' | 'materials';

type IndicatorConfig = {
  label: string;
  unit: string;
  shortLabel: string;
  baseline: number;
  trendSlope: number;
  volatility: number;
  higherIsBetter: boolean;
};

const ranges: DateRange[] = ['1M', '3M', '6M', '1Y', '3Y', '5Y', 'YTD'];

const states: StatePoint[] = [
  { code: 'AL', lat: 32.8, lon: -86.8 }, { code: 'AK', lat: 64.2, lon: -152.4 }, { code: 'AZ', lat: 34.0, lon: -111.7 },
  { code: 'AR', lat: 34.8, lon: -92.2 }, { code: 'CA', lat: 36.8, lon: -119.4 }, { code: 'CO', lat: 39.0, lon: -105.5 },
  { code: 'CT', lat: 41.6, lon: -72.7 }, { code: 'DE', lat: 39.0, lon: -75.5 }, { code: 'FL', lat: 27.8, lon: -81.7 },
  { code: 'GA', lat: 32.2, lon: -83.4 }, { code: 'HI', lat: 19.9, lon: -155.6 }, { code: 'ID', lat: 44.1, lon: -114.7 },
  { code: 'IL', lat: 40.0, lon: -89.2 }, { code: 'IN', lat: 40.0, lon: -86.1 }, { code: 'IA', lat: 42.1, lon: -93.6 },
  { code: 'KS', lat: 38.5, lon: -98.4 }, { code: 'KY', lat: 37.7, lon: -84.3 }, { code: 'LA', lat: 30.9, lon: -92.3 },
  { code: 'ME', lat: 45.3, lon: -69.0 }, { code: 'MD', lat: 39.0, lon: -76.7 }, { code: 'MA', lat: 42.2, lon: -71.8 },
  { code: 'MI', lat: 44.3, lon: -85.6 }, { code: 'MN', lat: 46.7, lon: -94.7 }, { code: 'MS', lat: 32.7, lon: -89.7 },
  { code: 'MO', lat: 38.6, lon: -92.5 }, { code: 'MT', lat: 46.9, lon: -110.4 }, { code: 'NE', lat: 41.5, lon: -99.8 },
  { code: 'NV', lat: 38.8, lon: -116.4 }, { code: 'NH', lat: 43.7, lon: -71.6 }, { code: 'NJ', lat: 40.1, lon: -74.5 },
  { code: 'NM', lat: 34.5, lon: -106.0 }, { code: 'NY', lat: 42.9, lon: -75.5 }, { code: 'NC', lat: 35.5, lon: -79.4 },
  { code: 'ND', lat: 47.5, lon: -100.5 }, { code: 'OH', lat: 40.4, lon: -82.8 }, { code: 'OK', lat: 35.6, lon: -97.5 },
  { code: 'OR', lat: 43.9, lon: -120.5 }, { code: 'PA', lat: 41.0, lon: -77.2 }, { code: 'RI', lat: 41.7, lon: -71.5 },
  { code: 'SC', lat: 33.8, lon: -80.9 }, { code: 'SD', lat: 44.4, lon: -100.2 }, { code: 'TN', lat: 35.8, lon: -86.4 },
  { code: 'TX', lat: 31.1, lon: -99.3 }, { code: 'UT', lat: 39.3, lon: -111.7 }, { code: 'VT', lat: 44.0, lon: -72.7 },
  { code: 'VA', lat: 37.5, lon: -78.7 }, { code: 'WA', lat: 47.4, lon: -120.7 }, { code: 'WV', lat: 38.6, lon: -80.6 },
  { code: 'WI', lat: 44.5, lon: -89.6 }, { code: 'WY', lat: 43.0, lon: -107.6 }, { code: 'DC', lat: 38.9, lon: -77.0 }
];

const regionMap: Record<string, string[]> = {
  Northeast: ['CT', 'ME', 'MA', 'NH', 'RI', 'VT', 'NJ', 'NY', 'PA'],
  Midwest: ['IL', 'IN', 'MI', 'OH', 'WI', 'IA', 'KS', 'MN', 'MO', 'NE', 'ND', 'SD'],
  South: ['DE', 'FL', 'GA', 'MD', 'NC', 'SC', 'VA', 'DC', 'WV', 'AL', 'KY', 'MS', 'TN', 'AR', 'LA', 'OK', 'TX'],
  West: ['AZ', 'CO', 'ID', 'MT', 'NV', 'NM', 'UT', 'WY', 'AK', 'CA', 'HI', 'OR', 'WA']
};

const metroMap: Record<string, string[]> = {
  CA: ['Los Angeles Metro', 'San Francisco Bay', 'San Diego Metro'],
  TX: ['Dallas-Fort Worth', 'Houston Metro', 'Austin-Round Rock'],
  FL: ['Miami-Fort Lauderdale', 'Tampa Bay', 'Orlando Metro'],
  NY: ['New York Metro', 'Buffalo-Niagara', 'Albany Capital'],
  IL: ['Chicago Metro', 'Peoria Metro'],
  WA: ['Seattle-Tacoma', 'Spokane Metro']
};

const stateBaseIntensity: Record<string, number> = {
  CA: 88, TX: 84, FL: 80, NY: 72, WA: 67, CO: 70, AZ: 75, NC: 71, GA: 74, IL: 61, NJ: 64, PA: 63, OH: 58, MI: 56, TN: 66,
  VA: 68, SC: 62, MA: 57, OR: 60, NV: 69, UT: 65, ID: 59, MN: 58, MO: 55, AL: 53, LA: 52, KY: 54, IN: 56
};

const indicators: Record<IndicatorKey, IndicatorConfig> = {
  permits: {
    label: 'Housing Starts / Permits',
    shortLabel: 'Permits',
    unit: 'Index',
    baseline: 104,
    trendSlope: 0.32,
    volatility: 1.3,
    higherIsBetter: true
  },
  spending: {
    label: 'Construction Spending (Proxy)',
    shortLabel: 'Spending',
    unit: 'Index',
    baseline: 112,
    trendSlope: 0.24,
    volatility: 1.1,
    higherIsBetter: true
  },
  residentialProxy: {
    label: 'Residential / Nonresidential Proxy',
    shortLabel: 'Res/Nonres',
    unit: 'Balance',
    baseline: 51,
    trendSlope: 0.18,
    volatility: 1.0,
    higherIsBetter: true
  },
  labor: {
    label: 'Labor Tightness',
    shortLabel: 'Labor',
    unit: 'Index',
    baseline: 58,
    trendSlope: -0.08,
    volatility: 0.9,
    higherIsBetter: false
  },
  materials: {
    label: 'Materials-Cost Pressure',
    shortLabel: 'Materials',
    unit: 'Index',
    baseline: 69,
    trendSlope: -0.06,
    volatility: 1.2,
    higherIsBetter: false
  }
};

const monthLabels = ['Jan 24', 'Feb 24', 'Mar 24', 'Apr 24', 'May 24', 'Jun 24', 'Jul 24', 'Aug 24', 'Sep 24', 'Oct 24', 'Nov 24', 'Dec 24', 'Jan 25', 'Feb 25', 'Mar 25', 'Apr 25', 'May 25', 'Jun 25', 'Jul 25', 'Aug 25', 'Sep 25', 'Oct 25', 'Nov 25', 'Dec 25'];

function tone(v: number) {
  if (v >= 80) return '#8af5ff';
  if (v >= 70) return '#43deff';
  if (v >= 60) return '#11b8ff';
  if (v >= 50) return '#3179f6';
  return '#2c3b5a';
}

function project(lon: number, lat: number, w: number, h: number) {
  const x = ((lon + 125) / 59) * w;
  const y = ((49.5 - lat) / 25.5) * h;
  return { x, y };
}

function statePolygon(code: string, x: number, y: number, size = 7) {
  const seed = code.charCodeAt(0) + code.charCodeAt(1);
  const d = [
    `${x - size},${y - size * 0.6}`,
    `${x - size * 0.1},${y - size}`,
    `${x + size * 0.8},${y - size * 0.35}`,
    `${x + size},${y + size * 0.45}`,
    `${x + size * 0.15},${y + size}`,
    `${x - size * 0.9},${y + size * 0.35}`
  ];
  const nudge = ((seed % 5) - 2) * 0.35;
  return d.map((pt, idx) => {
    const [px, py] = pt.split(',').map(Number);
    return `${(px + nudge * (idx % 2 ? 1 : -1)).toFixed(2)},${(py - nudge).toFixed(2)}`;
  }).join(' ');
}

function datePointsForRange(range: DateRange) {
  if (range === '1M') return 2;
  if (range === '3M') return 4;
  if (range === '6M') return 7;
  if (range === '1Y') return 12;
  if (range === 'YTD') return 12;
  return monthLabels.length;
}

function geographyMultiplier(level: GeographyLevel, region: string, state: string, metro: string) {
  if (level === 'US') return 1;
  if (level === 'Region') {
    return region === 'West' ? 1.06 : region === 'South' ? 1.03 : region === 'Northeast' ? 0.98 : 1.01;
  }
  if (level === 'State') {
    const base = (stateBaseIntensity[state] ?? 55) / 62;
    return Number(base.toFixed(2));
  }

  const metroBias = metro.includes('Bay') || metro.includes('Seattle') ? 1.08 : metro.includes('Dallas') ? 1.05 : 1.01;
  return metroBias;
}

function regionForState(code: string) {
  const region = Object.entries(regionMap).find(([, list]) => list.includes(code));
  return region?.[0] ?? 'South';
}

function USChoropleth({
  selectedState,
  indicator,
  onSelectState
}: {
  selectedState: string;
  indicator: IndicatorKey;
  onSelectState: (state: string) => void;
}) {
  const width = 620;
  const height = 360;

  const indicatorOffset = indicator === 'spending' ? 3 : indicator === 'materials' ? -3 : indicator === 'labor' ? -1 : 0;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" role="img" aria-label="U.S. state choropleth map">
      <rect x="0" y="0" width={width} height={height} fill="#0a1220" rx="14" />

      {states.map((s) => {
        const value = (stateBaseIntensity[s.code] ?? 46) + indicatorOffset;
        const lower48 = s.code !== 'AK' && s.code !== 'HI';
        const selected = s.code === selectedState;
        let p = project(s.lon, s.lat, width - 36, height - 30);
        p = { x: p.x + 18, y: p.y + 14 };

        if (s.code === 'AK') p = { x: 85, y: 305 };
        if (s.code === 'HI') p = { x: 175, y: 322 };

        return (
          <g
            key={s.code}
            transform={!lower48 && s.code === 'AK' ? 'scale(1.22)' : undefined}
            onClick={() => onSelectState(s.code)}
            className="cursor-pointer"
            aria-label={`Select ${s.code}`}
          >
            <polygon
              points={statePolygon(s.code, p.x, p.y, s.code === 'DC' ? 4 : 7)}
              fill={tone(value)}
              stroke={selected ? '#f8fafc' : 'rgba(148,163,184,0.55)'}
              strokeWidth={selected ? '1.9' : '0.8'}
              opacity={selected ? 1 : 0.96}
            />
            <text x={p.x} y={p.y + 2} textAnchor="middle" fontSize="6.5" fill={value >= 70 ? '#041019' : '#e2e8f0'}>
              {s.code}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function PerplexityDashboard() {
  const [geographyLevel, setGeographyLevel] = useState<GeographyLevel>('US');
  const [selectedRegion, setSelectedRegion] = useState('South');
  const [selectedState, setSelectedState] = useState('TX');
  const [selectedMetro, setSelectedMetro] = useState('Dallas-Fort Worth');
  const [selectedIndicator, setSelectedIndicator] = useState<IndicatorKey>('permits');
  const [dateRange, setDateRange] = useState<DateRange>('1Y');
  const [compareModels, setCompareModels] = useState(false);

  const currentIndicator = indicators[selectedIndicator];

  const metrosForState = metroMap[selectedState] ?? [`${selectedState} Metro Core`];

  const series = useMemo(() => {
    const mult = geographyMultiplier(geographyLevel, selectedRegion, selectedState, selectedMetro);
    return monthLabels.map((label, i) => {
      const seasonality = Math.sin(i * 0.7) * currentIndicator.volatility;
      const base = currentIndicator.baseline + i * currentIndicator.trendSlope + seasonality;
      const actual = Number((base * mult).toFixed(1));
      const bestModel = Number((actual + (currentIndicator.higherIsBetter ? 1.3 : -1.3)).toFixed(1));
      const benchmarkModel = Number((actual + (i % 2 === 0 ? 0.9 : -0.9)).toFixed(1));
      return { date: label, actual, bestModel, benchmarkModel };
    });
  }, [currentIndicator, geographyLevel, selectedMetro, selectedRegion, selectedState]);

  const filteredSeries = useMemo(() => {
    const points = datePointsForRange(dateRange);
    return series.slice(-points);
  }, [dateRange, series]);

  const kpis = useMemo(() => {
    const latest = filteredSeries[filteredSeries.length - 1];
    const prior = filteredSeries[Math.max(0, filteredSeries.length - 2)] ?? latest;
    const delta = Number((latest.actual - prior.actual).toFixed(1));
    const direction = delta >= 0 ? '+' : '';
    const confidence = compareModels ? 'Best model + benchmark' : 'Best model only';

    return [
      { label: `${currentIndicator.shortLabel} Level`, value: `${latest.actual}`, change: `${direction}${delta} vs prior` },
      { label: 'Forecast (3mo)', value: `${latest.bestModel}`, change: compareModels ? 'Showing model comparison' : 'Best model selected' },
      { label: 'Model Spread', value: `${Math.abs(latest.bestModel - latest.benchmarkModel).toFixed(1)}`, change: 'Best vs benchmark gap' },
      { label: 'Geography Context', value: geographyLevel, change: geographyLevel === 'US' ? 'National baseline' : `${selectedRegion}/${selectedState}` },
      { label: 'Data Freshness', value: 'Dec 2025', change: dateRange === '1M' ? 'Latest monthly cut' : `${dateRange} window` },
      { label: 'Model Confidence', value: confidence, change: 'Adaptive best-model routing' }
    ];
  }, [compareModels, currentIndicator.shortLabel, dateRange, filteredSeries, geographyLevel, selectedRegion, selectedState]);

  const geographicLabel = geographyLevel === 'US'
    ? 'National (USA)'
    : geographyLevel === 'Region'
      ? selectedRegion
      : geographyLevel === 'State'
        ? selectedState
        : `${selectedMetro}`;

  const handleMapStateSelect = (stateCode: string) => {
    setSelectedState(stateCode);
    setSelectedRegion(regionForState(stateCode));
    setGeographyLevel('State');
    const metros = metroMap[stateCode];
    if (metros?.length) {
      setSelectedMetro(metros[0]);
    } else {
      setSelectedMetro(`${stateCode} Metro Core`);
    }
  };

  return (
    <div className="space-y-3 rounded-[18px] border border-white/10 bg-[#0b1220] p-2 sm:space-y-4 sm:rounded-[22px] sm:p-3">
      <section className="rounded-2xl border border-white/10 bg-[#0f172a]">
        <div className="flex items-center justify-between border-b border-white/10 px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-md border border-cyan-400/30 bg-cyan-400/10 text-cyan-200">▦</div>
            <div>
              <h1 className="text-base font-semibold leading-tight text-slate-100 sm:text-lg">U.S. Construction Market</h1>
              <p className="text-[11px] text-slate-400 sm:text-xs">Interactive Dashboard &amp; Forecasting</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-slate-300">
            <button className="rounded-full border border-white/20 bg-white/5 px-2 py-1 text-[11px]">i</button>
            <button className="rounded-full border border-white/20 bg-white/5 px-2 py-1 text-[11px]">◐</button>
          </div>
        </div>

        <div className="space-y-2.5 p-3 sm:p-4">
          <div className="space-y-2.5">
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-slate-400">Geography Level</span>
              <select
                value={geographyLevel}
                onChange={(event) => setGeographyLevel(event.target.value as GeographyLevel)}
                className="w-full rounded-xl border border-white/15 bg-[#0b1324] px-3 py-2.5 text-sm text-slate-200"
              >
                <option>US</option>
                <option>Region</option>
                <option>State</option>
                <option>City/Metro</option>
              </select>
            </label>

            {geographyLevel === 'Region' || geographyLevel === 'State' || geographyLevel === 'City/Metro' ? (
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-slate-400">Region</span>
                <select
                  value={selectedRegion}
                  onChange={(event) => setSelectedRegion(event.target.value)}
                  className="w-full rounded-xl border border-white/15 bg-[#0b1324] px-3 py-2.5 text-sm text-slate-200"
                >
                  {Object.keys(regionMap).map((region) => (
                    <option key={region} value={region}>{region}</option>
                  ))}
                </select>
              </label>
            ) : null}

            {geographyLevel === 'State' || geographyLevel === 'City/Metro' ? (
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-slate-400">State</span>
                <select
                  value={selectedState}
                  onChange={(event) => {
                    const nextState = event.target.value;
                    setSelectedState(nextState);
                    setSelectedRegion(regionForState(nextState));
                    setSelectedMetro((metroMap[nextState] ?? [`${nextState} Metro Core`])[0]);
                  }}
                  className="w-full rounded-xl border border-white/15 bg-[#0b1324] px-3 py-2.5 text-sm text-slate-200"
                >
                  {states.map((state) => (
                    <option key={state.code} value={state.code}>{state.code}</option>
                  ))}
                </select>
              </label>
            ) : null}

            {geographyLevel === 'City/Metro' ? (
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-slate-400">City / Metro</span>
                <select
                  value={selectedMetro}
                  onChange={(event) => setSelectedMetro(event.target.value)}
                  className="w-full rounded-xl border border-white/15 bg-[#0b1324] px-3 py-2.5 text-sm text-slate-200"
                >
                  {metrosForState.map((metro) => (
                    <option key={metro} value={metro}>{metro}</option>
                  ))}
                </select>
              </label>
            ) : null}

            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-slate-400">Indicator</span>
              <select
                value={selectedIndicator}
                onChange={(event) => setSelectedIndicator(event.target.value as IndicatorKey)}
                className="w-full rounded-xl border border-white/15 bg-[#0b1324] px-3 py-2.5 text-sm text-slate-200"
              >
                <option value="permits">Housing Starts / Permits</option>
                <option value="spending">Construction Spending (Proxy)</option>
                <option value="residentialProxy">Residential / Nonresidential Proxy</option>
                <option value="labor">Labor Indicator</option>
                <option value="materials">Materials-Cost Indicator</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-slate-400">Forecast Framing</span>
              <button className="flex w-full items-center justify-between rounded-xl border border-white/15 bg-[#0b1324] px-3 py-2.5 text-left text-sm text-slate-200">
                <span>Best Model ({compareModels ? 'with comparison' : 'only'})</span>
                <span className="text-slate-500">▾</span>
              </button>
            </label>

            <div className="flex items-center justify-between rounded-xl border border-white/15 bg-[#0b1324] px-3 py-2.5">
              <div>
                <p className="text-sm text-slate-200">Compare Models</p>
                <p className="text-[11px] text-slate-500">Toggle overlay vs best-model default</p>
              </div>
              <button
                onClick={() => setCompareModels((current) => !current)}
                className={`relative h-6 w-11 rounded-full p-0.5 ${compareModels ? 'bg-cyan-500/80' : 'bg-slate-600'}`}
              >
                <span className={`block h-5 w-5 rounded-full bg-white transition-transform ${compareModels ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            {kpis.map((kpi) => (
              <article key={kpi.label} className="rounded-xl border border-white/10 bg-[#0b1324] px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-[0.1em] text-slate-400">{kpi.label}</p>
                <p className="mt-1 text-lg font-semibold leading-tight text-slate-50">{kpi.value}</p>
                <p className="mt-1 text-xs text-cyan-300">{kpi.change}</p>
              </article>
            ))}
          </div>

          <article className="rounded-2xl border border-white/10 bg-[#0b1324] p-3">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-medium text-slate-100">U.S. Geographic Distribution</h3>
              <span className="text-[11px] text-slate-400">{currentIndicator.shortLabel} · {geographicLabel}</span>
            </div>
            <div className="h-[300px] rounded-xl border border-white/10 bg-[#0a1220] p-2 sm:h-[360px]">
              <USChoropleth selectedState={selectedState} indicator={selectedIndicator} onSelectState={handleMapStateSelect} />
            </div>
          </article>

          <article className="rounded-2xl border border-white/10 bg-[#0b1324] p-3">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-medium text-slate-100">Construction Market Time Series</h3>
              <span className="text-[11px] text-slate-400">Best model {compareModels ? '+ benchmark' : 'only'}</span>
            </div>
            <div className="h-[300px] rounded-xl border border-white/10 bg-[#0a1220] p-2 sm:h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={filteredSeries}>
                  <defs>
                    <linearGradient id="actualFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="4%" stopColor="#22d3ee" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.22)" />
                  <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: '#0b1220', border: '1px solid rgba(148,163,184,0.25)' }} />
                  <Area type="monotone" dataKey="actual" stroke="#22d3ee" fill="url(#actualFill)" strokeWidth={2} name={`${currentIndicator.shortLabel} observed`} />
                  <Line type="monotone" dataKey="bestModel" stroke="#60a5fa" dot={false} strokeWidth={2} name="Best model forecast" />
                  {compareModels ? (
                    <Line type="monotone" dataKey="benchmarkModel" stroke="#f59e0b" dot={false} strokeWidth={2} strokeDasharray="6 4" name="Benchmark model" />
                  ) : null}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </article>

          <section className="rounded-2xl border border-white/10 bg-[#0b1324] px-3 py-2.5">
            <div className="flex flex-wrap gap-1.5">
              {ranges.map((r) => (
                <button
                  key={r}
                  onClick={() => setDateRange(r)}
                  className={`rounded-full border px-3 py-1.5 text-xs ${
                    r === dateRange ? 'border-cyan-400/60 bg-cyan-400/15 text-cyan-100' : 'border-white/15 bg-white/[0.03] text-slate-300'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-[#0b1324] p-4">
            <h3 className="text-sm font-semibold text-slate-100">Methodology &amp; Sources</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              Data layers combine permit activity, spending proxies, labor conditions, and materials-cost pressure from Census and BLS style feeds. Geography and
              indicator controls dynamically re-scope KPI and chart context to U.S., region, state, or metro cuts.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              Forecasting follows a best-model selection concept: the default view surfaces the currently selected model with the strongest validation score.
              Enabling compare mode overlays a benchmark model to show spread and stability.
            </p>
            <ul className="mt-3 space-y-2 text-xs text-slate-300">
              <li className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">Sources: Building Permits Survey, Construction Spending, BLS labor indicators, producer-price benchmarks.</li>
              <li className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">Best-model routing is currently mock-wired for UI behavior fidelity and ready for live forecasting service integration.</li>
              <li className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">Known limitations: simplified geometry and synthetic time-series values used for product behavior prototyping.</li>
            </ul>
          </section>
        </div>
      </section>
    </div>
  );
}
