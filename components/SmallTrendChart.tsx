'use client';

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { TrendPoint } from '@/types';

export function SmallTrendChart({ data, label }: { data: TrendPoint[]; label: string }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-panel p-4">
      <p className="mb-2 text-xs uppercase tracking-wide text-muted">{label}</p>
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <XAxis dataKey="period" stroke="#8EA0BF" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke="#8EA0BF" fontSize={11} tickLine={false} axisLine={false} width={28} />
            <Tooltip contentStyle={{ backgroundColor: '#111A2D', border: '1px solid #26344F', borderRadius: 10 }} />
            <Line type="monotone" dataKey="value" stroke="#60A5FA" strokeWidth={2.2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
