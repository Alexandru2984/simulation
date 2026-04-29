export default function MetricCard({ label, value, unit, icon, color }) {
  return (
    <div style={{
      background: '#1e293b', borderRadius: '16px', padding: '20px 24px',
      border: `1px solid ${color}33`, flex: '1', minWidth: '160px',
      boxShadow: `0 0 20px ${color}22`,
    }}>
      <div style={{ fontSize: '1.5rem', marginBottom: '4px' }}>{icon}</div>
      <div style={{ color: '#94a3b8', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {label}
      </div>
      <div style={{ color, fontSize: '2.2rem', fontWeight: 700, lineHeight: 1.2 }}>
        {value !== undefined && value !== null ? Number(value).toFixed(1) : '—'}
        <span style={{ fontSize: '1rem', color: '#64748b', marginLeft: '4px' }}>{unit}</span>
      </div>
    </div>
  );
}
