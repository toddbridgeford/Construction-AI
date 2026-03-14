'use client';

import React, { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { datePointsForRange } from '@/lib/dashboard-data';
import { useLiveDashboardData } from '@/lib/use-live-dashboard';
import { DateRange, GeographyLevel, IndicatorKey } from '@/types/live-data';
import { USStateChoropleth } from '@/components/USStateChoropleth';

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

const stateCodes = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'];

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


function regionForState(code: string) {
  const region = Object.entries(regionMap).find(([, list]) => list.includes(code));
  return region?.[0] ?? 'South';
}

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
  },
  mortgage: {
    label: 'Mortgage Rate Proxy',
    shortLabel: 'Mortgage',
    unit: '%',
    baseline: 6.5,
    trendSlope: -0.02,
    volatility: 0.2,
    higherIsBetter: false
  }
};


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

  const { data: liveData, loading, error } = useLiveDashboardData({
    geographyLevel,
    region: selectedRegion,
    state: selectedState,
    metro: selectedMetro,
    indicator: selectedIndicator
  });

  const series = liveData?.series ?? [];

  const filteredSeries = useMemo(() => {
    const points = datePointsForRange(dateRange);
    return series.slice(-points);
  }, [dateRange, series]);

  const chartSeries = filteredSeries.length ? filteredSeries : [{ date: 'N/A', actual: 0, bestModel: 0, benchmarkModel: 0 }];

  const kpis = useMemo(() => {
    const latest = filteredSeries[filteredSeries.length - 1] ?? { actual: 0, bestModel: 0, benchmarkModel: 0 };
    const prior = filteredSeries[Math.max(0, filteredSeries.length - 2)] ?? latest;
    const delta = Number((latest.actual - prior.actual).toFixed(1));
    const direction = delta >= 0 ? '+' : '';
    const confidence = compareModels ? 'Best model + benchmark' : 'Best model only';

    return [
      { label: `${currentIndicator.shortLabel} Level`, value: `${latest.actual}`, change: `${direction}${delta} vs prior` },
      { label: 'Forecast (3mo)', value: `${latest.bestModel}`, change: compareModels ? 'Showing model comparison' : 'Best model selected' },
      { label: 'Model Spread', value: `${Math.abs(latest.bestModel - latest.benchmarkModel).toFixed(1)}`, change: 'Best vs benchmark gap' },
      { label: 'Geography Context', value: geographyLevel, change: geographyLevel === 'US' ? 'National baseline' : `${selectedRegion}/${selectedState}` },
      { label: 'Data Freshness', value: liveData?.metadata.referencePeriod ?? 'N/A', change: dateRange === '1M' ? 'Latest monthly cut' : `${dateRange} window` },
      { label: 'Model Confidence', value: confidence, change: liveData?.metadata.isLive ? 'Live history + stub forecast' : 'Mock fallback in use' }
    ];
  }, [compareModels, currentIndicator.shortLabel, dateRange, filteredSeries, geographyLevel, liveData?.metadata.isLive, liveData?.metadata.referencePeriod, selectedRegion, selectedState]);

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
                  {stateCodes.map((stateCode) => (
                    <option key={stateCode} value={stateCode}>{stateCode}</option>
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
                <option value="mortgage">Mortgage Rate Proxy</option>
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

          {loading ? <p className="text-xs text-slate-400">Loading live data...</p> : null}
          {error ? <p className="text-xs text-amber-300">Live data fallback: {error}</p> : null}
          {!liveData?.metadata.isLive ? <p className="text-xs text-amber-300">Some indicator/geography combinations are using mock fallback values.</p> : null}

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
              <USStateChoropleth selectedState={selectedState} onSelectState={handleMapStateSelect} mapValues={liveData?.mapValues ?? {}} indicatorOffset={selectedIndicator === 'spending' ? 3 : selectedIndicator === 'materials' ? -3 : selectedIndicator === 'labor' ? -1 : 0} />
            </div>
          </article>

          <article className="rounded-2xl border border-white/10 bg-[#0b1324] p-3">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-medium text-slate-100">Construction Market Time Series</h3>
              <span className="text-[11px] text-slate-400">Best model {compareModels ? '+ benchmark' : 'only'}</span>
            </div>
            <div className="h-[300px] rounded-xl border border-white/10 bg-[#0a1220] p-2 sm:h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartSeries}>
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
              Data layers prioritize live public feeds from U.S. Census, BLS, and FRED where available, with graceful fallback stubs for unsupported combinations. Geography and
              indicator controls dynamically re-scope KPI and chart context to U.S., region, state, or metro cuts.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              Forecasting follows a best-model selection concept: the default view surfaces the currently selected model with the strongest validation score.
              Enabling compare mode overlays a benchmark model to show spread and stability.
            </p>
            <ul className="mt-3 space-y-2 text-xs text-slate-300">
              <li className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">Current source: {liveData?.metadata.source ?? "Stub"} · Reference period: {liveData?.metadata.referencePeriod ?? "N/A"}.</li>
              <li className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">Forecast layer remains stubbed for best-model comparison while historical values are sourced live where practical.</li>
              <li className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">Known limitations: region/state/metro disaggregation depends on source coverage; unsupported cuts gracefully fall back to mock values.</li>
            </ul>
          </section>
        </div>
      </section>
    </div>
  );
}
