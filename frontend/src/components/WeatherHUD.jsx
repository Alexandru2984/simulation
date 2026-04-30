import { useState, useEffect, useCallback } from 'react'
import SearchBar from './SearchBar'
import EventPanel from './EventPanel'
import SimStats from './SimStats'

// ── helpers ──────────────────────────────────────────────────────────────────
const COMPASS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW']
const toCompass = d => COMPASS[Math.round(d / 22.5) % 16]

function weatherIcon(pressure, temp) {
  if (temp !== null && temp < 0)      return '❄️'
  if (temp !== null && temp > 37)     return '🌡️'
  if (pressure === null)              return '🌍'
  if (pressure > 1020)               return '☀️'
  if (pressure > 1015)               return '⛅'
  if (pressure > 1010)               return '🌥️'
  if (pressure > 1003)               return '🌧️'
  return '⛈️'
}

// ── mobile detection hook ────────────────────────────────────────────────────
function useIsMobile() {
  const [mobile, setMobile] = useState(window.innerWidth < 768)
  useEffect(() => {
    const h = () => setMobile(window.innerWidth < 768)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  return mobile
}

// ── desktop arc gauge ────────────────────────────────────────────────────────
function ArcGauge({ value, min, max, label, unit, color }) {
  const pct = Math.max(0, Math.min(1, (value - min) / (max - min)))
  const W = 84, H = 54, cx = 42, cy = 48, r = 32
  const startAngle = -210, sweep = 240
  const toRad = a => (a * Math.PI) / 180
  const arcPath = (pct) => {
    const a0 = toRad(startAngle), a1 = toRad(startAngle + sweep * pct)
    const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0)
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1)
    const large = sweep * pct > 180 ? 1 : 0
    return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`
  }
  return (
    <div style={{ textAlign: 'center', flex: '1 1 0' }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
        <path d={arcPath(1)}   fill="none" stroke="#1e293b"      strokeWidth="5" strokeLinecap="round"/>
        <path d={arcPath(pct)} fill="none" stroke={color}        strokeWidth="5" strokeLinecap="round"/>
        {/* needle */}
        {(() => {
          const a = toRad(startAngle + sweep * pct)
          return <line x1={cx} y1={cy} x2={cx + 24 * Math.cos(a)} y2={cy + 24 * Math.sin(a)}
                   stroke={color} strokeWidth="2" strokeLinecap="round"/>
        })()}
        <circle cx={cx} cy={cy} r="3" fill={color}/>
      </svg>
      <div style={{ marginTop: -8, color, fontSize: '1.15rem', fontWeight: 700, lineHeight: 1 }}>
        {value !== null && value !== undefined ? Number(value).toFixed(1) : '—'}
        <span style={{ fontSize: '0.65rem', color: '#475569', marginLeft: 2 }}>{unit}</span>
      </div>
      <div style={{ color: '#475569', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 2 }}>
        {label}
      </div>
    </div>
  )
}

// ── mobile stat pill ─────────────────────────────────────────────────────────
function StatPill({ icon, value, unit, label, color }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 12px', background: '#0f172acc', borderRadius: 12,
      border: `1px solid ${color}33`, backdropFilter: 'blur(8px)',
    }}>
      <span style={{ fontSize: '1.2rem' }}>{icon}</span>
      <div>
        <div style={{ color, fontSize: '1.1rem', fontWeight: 700, lineHeight: 1 }}>
          {value !== null && value !== undefined ? Number(value).toFixed(1) : '—'}
          <span style={{ fontSize: '0.65rem', color: '#475569', marginLeft: 2 }}>{unit}</span>
        </div>
        <div style={{ color: '#475569', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      </div>
    </div>
  )
}

// ── main component ───────────────────────────────────────────────────────────
export default function WeatherHUD({ weatherData: wd, status, onSeed, onSpeedChange, onSearchSelect, locations, overlayMode, onOverlayMode, isMobile: isMobileProp, gridData, onStartPlacement, placementMode }) {
  const isMobileDetected = useIsMobile()
  const isMobile = isMobileProp ?? isMobileDetected
  const [speed, setSpeed]     = useState(1)
  const [seeding, setSeeding] = useState(false)
  const [activeCity, setActiveCity] = useState(null)

  const statusColor = { connected: '#22c55e', reconnecting: '#f59e0b', connecting: '#60a5fa' }[status] || '#64748b'
  const condIcon = weatherIcon(wd?.pressure ?? null, wd?.temperature ?? null)

  const handleSeed = useCallback(async (lat, lon, name) => {
    setSeeding(true)
    setActiveCity(name)
    await onSeed(lat, lon, name)
    setSeeding(false)
  }, [onSeed])

  const handleSpeed = (v) => { setSpeed(v); onSpeedChange(v) }

  // ── mobile layout ──────────────────────────────────────────────────────────
  if (isMobile) return (
    <>
      {/* Top bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
        background: 'linear-gradient(to bottom, #030711ee, transparent)',
        padding: '12px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '1.3rem' }}>{condIcon}</span>
          <div>
            <div style={{ color: '#f1f5f9', fontWeight: 700, fontSize: '0.9rem' }}>Weather Simulation</div>
            <div style={{ color: '#475569', fontSize: '0.62rem' }}>simulation.micutu.com</div>
          </div>
        </div>
        <span style={{
          padding: '3px 10px', borderRadius: 999, fontSize: '0.68rem',
          border: `1px solid ${statusColor}`, color: statusColor,
          background: '#0f172acc',
        }}>● {status}</span>
      </div>

      {/* Search bar (mobile) */}
      <div style={{
        position: 'absolute', top: 54, left: 0, right: 0, zIndex: 20,
        padding: '0 12px',
      }}>
        <SearchBar onSelect={(lat, lon, name) => { onSearchSelect(lat, lon, name); setActiveCity(name) }} isMobile />
      </div>

      {/* Right side stats */}
      <div style={{
        position: 'absolute', top: '50%', right: 12, transform: 'translateY(-50%)',
        zIndex: 20, display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <StatPill icon="🌡️" value={wd?.temperature}  unit="°C"  label="Temp"     color="#f97316" />
        <StatPill icon="🔵" value={wd?.pressure}     unit="hPa" label="Pressure" color="#60a5fa" />
        <StatPill icon="💨" value={wd?.wind_speed}   unit="m/s" label="Wind"     color="#34d399" />
        <div style={{
          padding: '8px 12px', background: '#0f172acc', borderRadius: 12,
          border: '1px solid #38bdf833', backdropFilter: 'blur(8px)', textAlign: 'center',
        }}>
          <div style={{ color: '#38bdf8', fontSize: '1.1rem', fontWeight: 700 }}>
            {wd ? toCompass(wd.wind_direction) : '—'}
          </div>
          <div style={{ color: '#475569', fontSize: '0.6rem', textTransform: 'uppercase' }}>Dir</div>
        </div>
      </div>

      {/* Bottom panel */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
        background: 'linear-gradient(to top, #030711f5, #030711cc, transparent)',
        padding: '12px 0 20px',
      }}>
        {/* City buttons — horizontal scroll */}
        <div style={{
          overflowX: 'auto', whiteSpace: 'nowrap', padding: '0 12px 8px',
          scrollbarWidth: 'none',
        }}>
          {(locations || []).map(loc => (
            <button key={loc.name}
              onClick={() => handleSeed(loc.lat, loc.lon, loc.name)}
              disabled={seeding}
              style={{
                display: 'inline-block', marginRight: 6,
                background: activeCity === loc.name ? '#1d4ed8' : '#1e293bcc',
                color: activeCity === loc.name ? '#fff' : '#94a3b8',
                border: `1px solid ${activeCity === loc.name ? '#3b82f6' : '#334155'}`,
                borderRadius: 20, padding: '5px 13px', fontSize: '0.78rem',
                cursor: seeding ? 'wait' : 'pointer', backdropFilter: 'blur(4px)',
                transition: 'all 0.2s', whiteSpace: 'nowrap',
              }}>
              {loc.flag} {loc.name}
            </button>
          ))}
        </div>

        {/* Speed row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '0 12px 4px' }}>
          <span style={{ color: '#475569', fontSize: '0.7rem' }}>⏩</span>
          {[1, 2, 5, 10, 20].map(v => (
            <button key={v} onClick={() => handleSpeed(v)} style={{
              background: speed === v ? '#7c3aed' : '#1e293bcc',
              color: speed === v ? '#fff' : '#64748b',
              border: `1px solid ${speed === v ? '#8b5cf6' : '#334155'}`,
              borderRadius: 6, padding: '4px 10px', fontSize: '0.72rem',
              cursor: 'pointer', backdropFilter: 'blur(4px)',
            }}>{v}x</button>
          ))}
          {seeding && <span style={{ color: '#38bdf8', fontSize: '0.7rem' }}>⟳ Seeding…</span>}
          {activeCity && !seeding && <span style={{ color: '#475569', fontSize: '0.7rem' }}>📍 {activeCity}</span>}
        </div>
        {/* Overlay mode row */}
        <div style={{ padding: '0 12px 4px', overflowX: 'auto', scrollbarWidth: 'none' }}>
          <ModeBar overlayMode={overlayMode} onOverlayMode={onOverlayMode} isMobile />
        </div>
        {/* Event injection row (mobile) */}
        {onStartPlacement && (
          <EventPanel onStartPlacement={onStartPlacement} placementMode={placementMode} isMobile />
        )}
        {/* Sim stats row (mobile) */}
        {gridData && <SimStats gridData={gridData} isMobile />}
      </div>
    </>
  )

  // ── desktop layout ─────────────────────────────────────────────────────────
  return (
    <>
      {/* Top-left: title */}
      <div style={{
        position: 'absolute', top: 20, left: 24, zIndex: 20,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ fontSize: '1.6rem' }}>{condIcon}</span>
        <div>
          <div style={{ color: '#f1f5f9', fontWeight: 700, fontSize: '1.05rem', letterSpacing: '-0.01em' }}>
            Weather Simulation
          </div>
          <div style={{ color: '#475569', fontSize: '0.7rem' }}>simulation.micutu.com</div>
        </div>
        <span style={{
          marginLeft: 8, padding: '2px 12px', borderRadius: 999,
          border: `1px solid ${statusColor}`, color: statusColor,
          fontSize: '0.7rem', background: '#0f172acc', backdropFilter: 'blur(6px)',
        }}>● {status}</span>
        {wd?.pressure < 1010 && (
          <span style={{
            padding: '2px 10px', borderRadius: 999, border: '1px solid #60a5fa',
            color: '#60a5fa', fontSize: '0.7rem', background: '#0f172acc',
          }}>🌧 Rain</span>
        )}
      </div>

      {/* Top-center: search */}
      <div style={{
        position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)',
        zIndex: 20, width: 280,
      }}>
        <SearchBar onSelect={(lat, lon, name) => { onSearchSelect(lat, lon, name); setActiveCity(name) }} isMobile={false} />
      </div>

      {/* Top-right: gauges */}
      <div style={{
        position: 'absolute', top: 16, right: 20, zIndex: 20,
        background: '#0f172aee', border: '1px solid #1e293b',
        borderRadius: 18, padding: '14px 20px 10px', backdropFilter: 'blur(10px)',
        display: 'flex', gap: 4, alignItems: 'flex-start',
        boxShadow: '0 4px 24px #00000066',
      }}>
        <ArcGauge value={wd?.temperature}    min={-20} max={50}   label="Temp"     unit="°C"  color="#f97316" />
        <ArcGauge value={wd?.pressure}       min={980}  max={1040} label="Pressure" unit="hPa" color="#60a5fa" />
        <ArcGauge value={wd?.wind_speed}     min={0}   max={30}   label="Wind"     unit="m/s" color="#34d399" />
        {/* Direction compass */}
        <div style={{ flex: '1 1 0', textAlign: 'center', paddingTop: 4 }}>
          {wd && <WindCompassSVG dir={wd.wind_direction} />}
          <div style={{ color: '#38bdf8', fontSize: '1.1rem', fontWeight: 700, marginTop: 2 }}>
            {wd ? toCompass(wd.wind_direction) : '—'}
          </div>
          <div style={{ color: '#475569', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 2 }}>
            Dir
          </div>
        </div>
      </div>

      {/* Bottom: cities + speed */}
      <div style={{
        position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
        zIndex: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
        width: 'min(720px, 95vw)',
      }}>
        <div style={{
          background: '#0f172aee', border: '1px solid #1e293b', borderRadius: 16,
          padding: '10px 14px', backdropFilter: 'blur(10px)',
          display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'center',
          boxShadow: '0 4px 24px #00000066',
        }}>
          {(locations || []).map(loc => (
            <button key={loc.name}
              onClick={() => handleSeed(loc.lat, loc.lon, loc.name)}
              disabled={seeding}
              style={{
                background: activeCity === loc.name ? '#1d4ed8' : '#1e293b',
                color: activeCity === loc.name ? '#fff' : '#94a3b8',
                border: `1px solid ${activeCity === loc.name ? '#3b82f6' : '#334155'}`,
                borderRadius: 8, padding: '4px 12px', fontSize: '0.76rem',
                cursor: seeding ? 'wait' : 'pointer', transition: 'all 0.18s',
              }}>
              {loc.flag} {loc.name}
            </button>
          ))}
        </div>

        <div style={{
          background: '#0f172aee', border: '1px solid #1e293b', borderRadius: 12,
          padding: '8px 16px', backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ color: '#475569', fontSize: '0.72rem', fontWeight: 600 }}>SIM SPEED</span>
          {[1, 2, 5, 10, 20].map(v => (
            <button key={v} onClick={() => handleSpeed(v)} style={{
              background: speed === v ? '#7c3aed' : '#1e293b',
              color: speed === v ? '#fff' : '#64748b',
              border: `1px solid ${speed === v ? '#8b5cf6' : '#334155'}`,
              borderRadius: 6, padding: '3px 10px', fontSize: '0.74rem', cursor: 'pointer',
              transition: 'all 0.15s',
            }}>{v}x</button>
          ))}
          <span style={{ color: '#334155', marginLeft: 4 }}>│</span>
          <span style={{ color: seeding ? '#38bdf8' : '#475569', fontSize: '0.7rem', minWidth: 90 }}>
            {seeding ? '⟳ Seeding…' : activeCity ? `📍 ${activeCity}` : '🌐 Click globe or city'}
          </span>
        </div>
        {/* Overlay mode bar */}
        <div style={{
          background: '#0f172aee', border: '1px solid #1e293b', borderRadius: 12,
          padding: '8px 16px', backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ color: '#475569', fontSize: '0.72rem', fontWeight: 600, whiteSpace: 'nowrap' }}>OVERLAY</span>
          <ModeBar overlayMode={overlayMode} onOverlayMode={onOverlayMode} isMobile={false} />
        </div>
      </div>
    </>
  )
}

const OVERLAY_MODES = [
  { id: 'none',     label: '🌍 Globe',    color: '#64748b' },
  { id: 'temp',     label: '🌡️ Temp',    color: '#f97316' },
  { id: 'pressure', label: '🔵 Pressure', color: '#60a5fa' },
  { id: 'humidity', label: '💧 Humidity', color: '#34d399' },
  { id: 'precip',   label: '🌧 Precip',   color: '#818cf8' },
  { id: 'wind',     label: '💨 Wind',     color: '#38bdf8' },
]

function ModeBar({ overlayMode, onOverlayMode, isMobile }) {
  return (
    <div style={{
      display: 'flex', gap: isMobile ? 4 : 6,
      flexWrap: isMobile ? 'nowrap' : 'wrap',
      overflowX: isMobile ? 'auto' : 'visible',
      scrollbarWidth: 'none',
    }}>
      {OVERLAY_MODES.map(m => (
        <button key={m.id} onClick={() => onOverlayMode(m.id)} style={{
          whiteSpace: 'nowrap',
          background: overlayMode === m.id ? m.color + '33' : 'transparent',
          color: overlayMode === m.id ? m.color : '#475569',
          border: `1px solid ${overlayMode === m.id ? m.color : '#1e293b'}`,
          borderRadius: 6, padding: isMobile ? '4px 9px' : '3px 11px',
          fontSize: isMobile ? '0.72rem' : '0.74rem', cursor: 'pointer',
          transition: 'all 0.15s',
        }}>{m.label}</button>
      ))}
    </div>
  )
}
function WindCompassSVG({ dir }) {
  const rad = ((dir - 90) * Math.PI) / 180
  const cx = 42, cy = 34, r = 22
  const nx = cx + r * Math.cos(rad), ny = cy + r * Math.sin(rad)
  return (
    <svg width="84" height="54" viewBox="0 0 84 54" style={{ overflow: 'visible' }}>
      <circle cx={cx} cy={cy} r={r + 4} fill="#0f172a" stroke="#1e293b" strokeWidth="1"/>
      {['N','E','S','W'].map((d, i) => {
        const a = (i * 90 - 90) * Math.PI / 180
        return (
          <text key={d} x={cx + (r + 11) * Math.cos(a)} y={cy + (r + 11) * Math.sin(a)}
            textAnchor="middle" dominantBaseline="middle"
            fill="#334155" fontSize="8" fontWeight="bold">{d}</text>
        )
      })}
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round"/>
      <circle cx={cx} cy={cy} r="3" fill="#38bdf8"/>
    </svg>
  )
}
