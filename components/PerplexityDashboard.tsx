'use client';

import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type StatePoint = { code: string; lat: number; lon: number };

const kpis = [
  { label: 'Total Market Index', value: '104.8', change: '+1.9%' },
  { label: 'Building Permits', value: '1.49M', change: '+0.7%' },
  { label: 'Housing Starts', value: '1.36M', change: '-0.3%' },
  { label: 'Contractor Backlog', value: '8.1 mo', change: '+0.2 mo' },
  { label: 'Labor Tightness', value: '58', change: '-2 pts' }
];

const ranges = ['1M', '3M', '6M', '1Y', '3Y', '5Y', 'YTD'];

const series = [
  { date: 'Jan', index: 94, permits: 89 },
  { date: 'Feb', index: 96, permits: 90 },
  { date: 'Mar', index: 98, permits: 91 },
  { date: 'Apr', index: 97, permits: 92 },
  { date: 'May', index: 101, permits: 94 },
  { date: 'Jun', index: 103, permits: 95 },
  { date: 'Jul', index: 102, permits: 96 },
  { date: 'Aug', index: 104, permits: 97 },
  { date: 'Sep', index: 107, permits: 99 },
  { date: 'Oct', index: 108, permits: 100 },
  { date: 'Nov', index: 106, permits: 99 },
  { date: 'Dec', index: 109, permits: 101 }
];

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

const intensity: Record<string, number> = {
  CA: 88, TX: 84, FL: 80, NY: 72, WA: 67, CO: 70, AZ: 75, NC: 71, GA: 74, IL: 61, NJ: 64, PA: 63, OH: 58, MI: 56, TN: 66,
  VA: 68, SC: 62, MA: 57, OR: 60, NV: 69, UT: 65, ID: 59, MN: 58, MO: 55, AL: 53, LA: 52, KY: 54, IN: 56
};

function tone(v: number) {
  if (v >= 80) return '#67e8f9';
  if (v >= 70) return '#22d3ee';
  if (v >= 60) return '#0ea5e9';
  if (v >= 50) return '#3b82f6';
  return '#334155';
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

function USChoropleth() {
  const width = 620;
  const height = 360;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" role="img" aria-label="U.S. state choropleth map">
      <rect x="0" y="0" width={width} height={height} fill="#0a1220" rx="12" />

      {states.map((s) => {
        const v = intensity[s.code] ?? 46;
        const lower48 = s.code !== 'AK' && s.code !== 'HI';
        let p = project(s.lon, s.lat, width - 36, height - 30);
        p = { x: p.x + 18, y: p.y + 14 };

        if (s.code === 'AK') p = { x: 85, y: 305 };
        if (s.code === 'HI') p = { x: 175, y: 322 };

        return (
          <g key={s.code} transform={!lower48 && s.code === 'AK' ? 'scale(1.22)' : undefined}>
            <polygon
              points={statePolygon(s.code, p.x, p.y, s.code === 'DC' ? 4 : 7)}
              fill={tone(v)}
              stroke="rgba(148,163,184,0.5)"
              strokeWidth="0.8"
              opacity={0.95}
            />
            <text x={p.x} y={p.y + 2} textAnchor="middle" fontSize="6.5" fill={v >= 70 ? '#041019' : '#e2e8f0'}>
              {s.code}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function PerplexityDashboard() {
  return (
    <div className="space-y-3">
      <section className="rounded-2xl border border-white/10 bg-[#0f1729] p-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-slate-400">Perplexity Computer</p>
            <h2 className="mt-1 text-[26px] font-semibold leading-none text-slate-100">U.S. Construction Market</h2>
            <p className="mt-1 text-xs text-slate-400">Overview dashboard · Updated Dec 2025</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="rounded-md border border-white/15 bg-white/[0.03] px-3 py-1 text-xs text-slate-300">Compare</button>
            <button className="rounded-md border border-white/15 bg-white/[0.03] px-3 py-1 text-xs text-slate-300">Export</button>
          </div>
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-5">
          {kpis.map((kpi) => (
            <article key={kpi.label} className="rounded-lg border border-white/10 bg-[#0b1222] px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.06em] text-slate-400">{kpi.label}</p>
              <p className="mt-1 text-lg font-semibold leading-none text-slate-100">{kpi.value}</p>
              <p className="mt-1 text-[11px] text-cyan-300">{kpi.change}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-3 xl:grid-cols-[1.16fr,1fr]">
        <article className="rounded-2xl border border-white/10 bg-[#0f1729] p-3">
          <div className="mb-2 flex items-center justify-between px-1">
            <h3 className="text-sm font-medium text-slate-200">U.S. State Choropleth</h3>
            <span className="text-[11px] text-slate-400">Activity Index</span>
          </div>
          <div className="h-[334px] rounded-xl border border-white/10 bg-[#0a1220] p-2">
            <USChoropleth />
          </div>
        </article>

        <article className="rounded-2xl border border-white/10 bg-[#0f1729] p-3">
          <div className="mb-2 flex items-center justify-between px-1">
            <h3 className="text-sm font-medium text-slate-200">Construction Market Time Series</h3>
            <span className="text-[11px] text-slate-400">Index vs Permits</span>
          </div>
          <div className="h-[334px] rounded-xl border border-white/10 bg-[#0a1220] p-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series}>
                <defs>
                  <linearGradient id="idx" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="4%" stopColor="#22d3ee" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.22)" />
                <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} domain={[85, 112]} />
                <Tooltip contentStyle={{ background: '#0b1220', border: '1px solid rgba(148,163,184,0.25)' }} />
                <Area type="monotone" dataKey="index" stroke="#22d3ee" fill="url(#idx)" strokeWidth={2} />
                <Line type="monotone" dataKey="permits" stroke="#60a5fa" dot={false} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </article>
      </section>

      <section className="rounded-2xl border border-white/10 bg-[#0f1729] px-3 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-2 text-[10px] uppercase tracking-[0.18em] text-slate-500">Date Range</span>
          {ranges.map((r) => (
            <button
              key={r}
              className={`rounded-md border px-2.5 py-1 text-xs ${
                r === '1Y' ? 'border-cyan-400/50 bg-cyan-400/15 text-cyan-100' : 'border-white/10 bg-white/[0.03] text-slate-300'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-3 xl:grid-cols-[1.22fr,1fr]">
        <article className="rounded-2xl border border-white/10 bg-[#0f1729] p-4">
          <h3 className="text-sm font-medium text-slate-100">Methodology</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            Composite activity blends permit issuance, construction spending momentum, labor availability, and input-cost pressure. State-level values
            are normalized and color-binned for choropleth rendering to highlight regional differences.
          </p>
        </article>

        <article className="rounded-2xl border border-white/10 bg-[#0f1729] p-4">
          <h3 className="text-sm font-medium text-slate-100">Sources</h3>
          <ul className="mt-2 space-y-1.5 text-xs text-slate-300">
            <li className="rounded-md border border-white/10 bg-white/[0.02] px-2.5 py-1.5">U.S. Census Bureau Building Permits Survey</li>
            <li className="rounded-md border border-white/10 bg-white/[0.02] px-2.5 py-1.5">BLS Construction Employment</li>
            <li className="rounded-md border border-white/10 bg-white/[0.02] px-2.5 py-1.5">U.S. Census Construction Spending</li>
            <li className="rounded-md border border-white/10 bg-white/[0.02] px-2.5 py-1.5">Producer Price Index, Construction Inputs</li>
          </ul>
        </article>
      </section>
    </div>
  );
}
