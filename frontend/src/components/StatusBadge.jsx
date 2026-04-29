export default function StatusBadge({ status }) {
  const colors = {
    connected:    '#22c55e',
    reconnecting: '#f59e0b',
    connecting:   '#60a5fa',
  };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '6px',
      background: '#1e293b', border: `1px solid ${colors[status] ?? '#64748b'}`,
      borderRadius: '9999px', padding: '2px 12px', fontSize: '0.78rem',
      color: colors[status] ?? '#94a3b8',
    }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: colors[status] ?? '#64748b',
        boxShadow: `0 0 6px ${colors[status] ?? '#64748b'}`,
      }} />
      {status}
    </span>
  );
}
