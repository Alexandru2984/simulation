import {
  ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts';

export default function WeatherChart({ data, dataKey, color, label, unit, domain }) {
  if (!data || data.length === 0) {
    return (
      <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569' }}>
        Waiting for data…
      </div>
    );
  }
  return (
    <div style={{ background: '#1e293b', borderRadius: '16px', padding: '16px 24px', border: '1px solid #334155' }}>
      <div style={{ color: '#94a3b8', fontSize: '0.8rem', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {label}
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
          <XAxis
            dataKey="t"
            tick={{ fill: '#475569', fontSize: 10 }}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={domain || ['auto', 'auto']}
            tick={{ fill: '#475569', fontSize: 10 }}
            tickFormatter={v => `${v}${unit}`}
          />
          <Tooltip
            contentStyle={{ background: '#0f172a', border: `1px solid ${color}`, borderRadius: 8 }}
            labelStyle={{ color: '#94a3b8' }}
            formatter={v => [`${Number(v).toFixed(2)} ${unit}`, label]}
          />
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
