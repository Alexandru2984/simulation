/**
 * Shared ArcGauge — semi-circular gauge with needle.
 * size: 'sm' (74×48) or 'md' (84×54)
 */
export function ArcGauge({ value, min, max, label, unit, color, size = 'md' }) {
  const isSmall = size === 'sm'
  const W  = isSmall ? 74 : 84
  const H  = isSmall ? 48 : 54
  const cx = W / 2
  const cy = H - 6
  const r  = isSmall ? 28 : 32

  const safeVal = (value !== null && value !== undefined && !isNaN(Number(value)))
    ? Number(value) : min
  const pct = Math.max(0, Math.min(1, (safeVal - min) / (max - min)))

  const startAngle = -210
  const sweep      = 240
  const toRad      = a => (a * Math.PI) / 180

  const arcPath = p => {
    const a0 = toRad(startAngle), a1 = toRad(startAngle + sweep * p)
    const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0)
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1)
    const large = sweep * p > 180 ? 1 : 0
    return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`
  }

  const angle    = toRad(startAngle + sweep * pct)
  const needleLen = isSmall ? 20 : 24
  const rawX2 = cx + needleLen * Math.cos(angle)
  const rawY2 = cy + needleLen * Math.sin(angle)
  const x2 = isNaN(rawX2) ? cx : rawX2
  const y2 = isNaN(rawY2) ? cy : rawY2

  const valStr = (value !== null && value !== undefined && !isNaN(Number(value)))
    ? Number(value).toFixed(1) : '—'

  return (
    <div style={{ textAlign: 'center', flex: '1 1 0' }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
        <path d={arcPath(1)}   fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" strokeLinecap="round"/>
        <path d={arcPath(pct)} fill="none" stroke={color}                  strokeWidth="5" strokeLinecap="round"/>
        <line x1={cx} y1={cy} x2={x2} y2={y2} stroke={color} strokeWidth="2" strokeLinecap="round"/>
        <circle cx={cx} cy={cy} r="3" fill={color}/>
      </svg>
      <div style={{ marginTop: isSmall ? -6 : -8, color, fontSize: isSmall ? '0.88rem' : '1.05rem', fontWeight: 700, lineHeight: 1 }}>
        {valStr}
        <span style={{ fontSize: '0.57rem', color: 'rgba(255,255,255,0.28)', marginLeft: 1 }}>{unit}</span>
      </div>
      <div style={{ color: 'rgba(255,255,255,0.28)', fontSize: '0.57rem', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 2 }}>
        {label}
      </div>
    </div>
  )
}
