import { useWeatherSocket } from './hooks/useWeatherSocket';
import MetricCard from './components/MetricCard';
import WeatherChart from './components/WeatherChart';
import StatusBadge from './components/StatusBadge';

function WindCompass({ direction }) {
  const rad = (direction * Math.PI) / 180;
  const cx = 40, cy = 40, r = 28;
  const nx = cx + r * Math.sin(rad);
  const ny = cy - r * Math.cos(rad);
  return (
    <svg width="80" height="80" style={{ display: 'block', margin: '0 auto' }}>
      <circle cx={cx} cy={cy} r={r + 6} fill="#0f172a" stroke="#334155" strokeWidth="1" />
      {['N','E','S','W'].map((dir, i) => {
        const a = i * 90 * Math.PI / 180;
        return (
          <text key={dir}
            x={cx + (r + 14) * Math.sin(a)} y={cy - (r + 14) * Math.cos(a)}
            textAnchor="middle" dominantBaseline="middle"
            fill="#475569" fontSize="9" fontWeight="bold">{dir}</text>
        );
      })}
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="3" fill="#38bdf8" />
    </svg>
  );
}

export default function App() {
  const { data, history, status } = useWeatherSocket();

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#f1f5f9', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ padding: '20px 32px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
            🌦️ Weather Simulation Engine
          </h1>
          <p style={{ margin: '2px 0 0', color: '#64748b', fontSize: '0.8rem' }}>
            Real-time atmospheric simulation • simulation.micutu.com
          </p>
        </div>
        <StatusBadge status={status} />
      </header>

      <main style={{ padding: '24px 32px', maxWidth: '1100px', margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '24px' }}>
          <MetricCard label="Temperature" value={data?.temperature} unit="°C" icon="🌡️" color="#f97316" />
          <MetricCard label="Pressure"    value={data?.pressure}    unit=" hPa" icon="🔵" color="#60a5fa" />
          <MetricCard label="Wind Speed"  value={data?.wind_speed}  unit=" m/s" icon="💨" color="#34d399" />
          <div style={{ background: '#1e293b', borderRadius: '16px', padding: '20px 24px',
            border: '1px solid #38bdf833', flex: '1', minWidth: '160px', boxShadow: '0 0 20px #38bdf822',
            display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '4px' }}>🧭</div>
            <div style={{ color: '#94a3b8', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
              Wind Direction
            </div>
            <WindCompass direction={data?.wind_direction ?? 0} />
            <div style={{ color: '#38bdf8', fontSize: '1.1rem', fontWeight: 600 }}>
              {data ? `${Number(data.wind_direction).toFixed(1)}°` : '—'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <WeatherChart data={history} dataKey="temperature" color="#f97316" label="Temperature" unit="°C" />
          <WeatherChart data={history} dataKey="pressure"    color="#60a5fa" label="Pressure"    unit=" hPa" domain={[1005, 1022]} />
          <WeatherChart data={history} dataKey="wind_speed"  color="#34d399" label="Wind Speed"  unit=" m/s" />
        </div>

        <footer style={{ marginTop: '32px', color: '#334155', fontSize: '0.75rem', textAlign: 'center' }}>
          {data && (
            <>Last update: {new Date(data.timestamp * 1000).toLocaleString()} &nbsp;·&nbsp; {history.length} samples</>
          )}
        </footer>
      </main>
    </div>
  );
}
