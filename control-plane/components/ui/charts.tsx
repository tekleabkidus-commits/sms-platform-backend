'use client';

import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, AreaChart, Area } from 'recharts';
import { AppCard } from './primitives';

export function TrendChart({
  title,
  description,
  data,
  lines,
}: {
  title: string;
  description: string;
  data: Array<Record<string, number | string>>;
  lines: Array<{ key: string; color: string }>;
}): React.ReactElement {
  return (
    <AppCard className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
        <p className="text-sm text-slate-500">{description}</p>
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 12 }} />
            <YAxis tick={{ fill: '#64748b', fontSize: 12 }} />
            <Tooltip />
            {lines.map((line) => (
              <Line
                key={line.key}
                type="monotone"
                dataKey={line.key}
                stroke={line.color}
                strokeWidth={2.5}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </AppCard>
  );
}

export function AreaTrendChart({
  title,
  description,
  data,
  dataKey,
  color,
}: {
  title: string;
  description: string;
  data: Array<Record<string, number | string>>;
  dataKey: string;
  color: string;
}): React.ReactElement {
  return (
    <AppCard className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
        <p className="text-sm text-slate-500">{description}</p>
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 12 }} />
            <YAxis tick={{ fill: '#64748b', fontSize: 12 }} />
            <Tooltip />
            <Area type="monotone" dataKey={dataKey} stroke={color} fill={color} fillOpacity={0.22} strokeWidth={2.5} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </AppCard>
  );
}
