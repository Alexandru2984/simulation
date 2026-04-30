import { useState, useEffect, useCallback } from 'react'
import SearchBar from './SearchBar'

// ── helpers ───────────────────────────────────────────────────────────────────
const COMPASS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW']
const toCompass = d => COMPASS[Math.round(d / 22.5) % 16]

function weatherIcon(pressure, temp) {
  if (temp !== null && temp < 0)   return '❄️'
  if (temp !== null && temp > 37)  return '🌡️'
  if (pressure === null)           return '🌍'
  if (pressure > 1020)             return '☀️'
  if (pressure > 1015)             return '⛅'
  if (pressure > 1010)             return '🌥️'
  if (pressure > 1003)             return '🌧️'
  return '⛈️'
}

const OVERLAY_MODES = [
  { id: 'none',     label: '🌍 Globe',    color: '#64748b' },
  { id: 'temp',     label: '🌡️ Temp',    color: '#f97316' },
  { id: 'pressure', label: '🔵 Pressure', color: '#60a5fa' },
  { id: 'humidity', label: '💧 Humidity', color: '#34d399' },
  { id: 'precip',   label: '🌧 Precip',   color: '#818cf8' },
  { id: 'wind',     label: '💨 Wind',     color: '#38bdf8' },
  { id: 'storm',    label: '⚡ Storm',    color: '#f59e0b' },
]

const MOBILE_EVENTS = [
  { id: 'cyclone',       icon: '🌀', color: '#a855f7' },
  { id: 'heat_dome',     icon: '🌡️', color: '#f97316' },
  { id: 'cold_outbreak', icon: '❄️', color: '#60a5fa' },
  { id: 'blocking_high', icon: '🔵', color: '#34d399' },
  { id: 'tornado',       icon: '🌪️', color: '#fbbf24' },
]

const GLASS = {
  background: 'rgba(10,15,30,0.82)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: '1px solid rgba(255,255,255,0.08)',
}

// ── main component ────────────────────────────────────────────────────────────
export default function WeatherHUD({
  weatherData: wd, status, onSeed, onSpeedChange, onSearchSelect,
  locations, overlayMode, onOverlayMode, isMobile,
  gridData, onStartPlacement, placementMode,
}) {
  const [speed, setSpeed]               = useState(1)
  const [seeding, setSeeding]           = useState(false)
  const [activeCity, setActiveCity]     = useState(null)
  const [searchOpen, setSearchOpen]     = useState(false)
  const [sheetExpanded, setSheetExpanded] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState(null)

  const statusColor = { connected: '#22c55e', reconnecting: '#f59e0b', connecting: '#60a5fa' }[status] || '#64748b'
  const condIcon    = weatherIcon(wd?.pressure ?? null, wd?.temperature ?? null)

  const handleSeed = useCallback(async (lat, lon, name) => {
    setSeeding(true)
    setActiveCity(name)
    await onSeed(lat, lon, name)
    setSeeding(false)
  }, [onSeed])

  const handleSpeed = v => { setSpeed(v); onSpeedChange(v) }

  const handleEventSelect = useCallback(id => {
    if (selectedEvent === id) { setSelectedEvent(null); onStartPlacement(null) }
    else { setSelectedEvent(id); onStartPlacement(id) }
  }, [selectedEvent, onStartPlacement])

  // Keep local selectedEvent in sync if parent clears placementMode
  useEffect(() => { if (!placementMode) setSelectedEvent(null) }, [placementMode])

  // ── MOBILE ────────────────────────────────────────────────────────────────
  if (isMobile) return (
    <>
      {/* Top bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 25,
        height: 52, ...GLASS,
        borderTop: 'none', borderLeft: 'none', borderRight: 'none',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', padding: '0 10px', gap: 8,
      }}>
        {/* Hamburger */}
        <button onClick={() => setSheetExpanded(e => !e)} style={{
          width: 44, height: 44, borderRadius: 10, flexShrink: 0, cursor: 'pointer',
          background: sheetExpanded ? 'rgba(59,130,246,0.15)' : 'transparent',
          border: `1px solid ${sheetExpanded ? 'rgba(59,130,246,0.5)' : 'rgba(255,255,255,0.1)'}`,
          color: 'rgba(255,255,255,0.8)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
        }}>
          <span style={{ width: 16, height: 2, background: 'currentColor', borderRadius: 2, display: 'block' }}/>
          <span style={{ width: 16, height: 2, background: 'currentColor', borderRadius: 2, display: 'block' }}/>
          <span style={{ width: 16, height: 2, background: 'currentColor', borderRadius: 2, display: 'block' }}/>
        </button>

        {/* Title */}
        <div style={{ flex: 1, textAlign: 'center' }}>
          <span style={{ color: '#f1f5f9', fontWeight: 700, fontSize: '0.92rem' }}>
            {condIcon} Weather Sim
          </span>
        </div>

        {/* Search toggle */}
        <button onClick={() => setSearchOpen(e => !e)} style={{
          width: 44, height: 44, borderRadius: 10, flexShrink: 0, cursor: 'pointer',
          background: searchOpen ? 'rgba(59,130,246,0.15)' : 'transparent',
          border: `1px solid ${searchOpen ? 'rgba(59,130,246,0.5)' : 'rgba(255,255,255,0.1)'}`,
          color: 'rgba(255,255,255,0.8)', fontSize: '1.1rem',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>🔍</button>

        {/* Status dot */}
        <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: statusColor, boxShadow: `0 0 6px ${statusColor}` }} />
      </div>

      {/* Search overlay (full-width, drops below top bar) */}
      {searchOpen && (
        <div style={{
          position: 'absolute', top: 52, left: 0, right: 0, zIndex: 30,
          ...GLASS, borderTop: 'none', borderLeft: 'none', borderRight: 'none',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          padding: '10px 12px',
        }}>
          <SearchBar
            onSelect={(lat, lon, name) => { onSearchSelect(lat, lon, name); setActiveCity(name); setSearchOpen(false) }}
            isMobile
          />
        </div>
      )}

      {/* Bottom sheet */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 25,
        ...GLASS,
        borderRadius: '18px 18px 0 0',
        borderBottom: 'none', borderLeft: 'none', borderRight: 'none',
        height: sheetExpanded ? '52vh' : 108,
        transition: 'height 0.3s cubic-bezier(0.4,0,0.2,1)',
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Drag handle */}
        <div onClick={() => setSheetExpanded(e => !e)} style={{
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          padding: '10px 0 6px', cursor: 'pointer', flexShrink: 0,
        }}>
          <div style={{ width: 32, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.18)' }} />
        </div>

        {/* Collapsed row: weather summary + event icon buttons */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 12px 10px', gap: 8, flexShrink: 0 }}>
          {/* Weather info */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: '1.4rem', flexShrink: 0 }}>{condIcon}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ color: '#f97316', fontWeight: 700, fontSize: '1.1rem', lineHeight: 1 }}>
                  {wd?.temperature != null ? `${Number(wd.temperature).toFixed(0)}°` : '—'}
                </span>
                <span style={{ color: '#34d399', fontSize: '0.78rem' }}>
                  {wd?.wind_speed != null ? `${Number(wd.wind_speed).toFixed(0)} m/s` : ''}
                </span>
                {wd && (
                  <span style={{ color: 'rgba(255,255,255,0.38)', fontSize: '0.68rem' }}>
                    {toCompass(wd.wind_direction)}
                  </span>
                )}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.28)', fontSize: '0.65rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {activeCity || 'Global simulation'}
              </div>
            </div>
          </div>

          {/* Event icon buttons (touch targets ≥ 44px) */}
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            {MOBILE_EVENTS.map(ev => (
              <button key={ev.id} onClick={() => handleEventSelect(ev.id)} style={{
                width: 44, height: 44, borderRadius: 10,
                background: selectedEvent === ev.id ? ev.color + '22' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${selectedEvent === ev.id ? ev.color : 'rgba(255,255,255,0.07)'}`,
                color: selectedEvent === ev.id ? ev.color : 'rgba(255,255,255,0.5)',
                cursor: 'pointer', fontSize: '1.2rem',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.2s ease',
              }}>{ev.icon}</button>
            ))}
          </div>
        </div>

        {/* Expanded content */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '4px 12px 20px',
          display: 'flex', flexDirection: 'column', gap: 14,
          opacity: sheetExpanded ? 1 : 0,
          transition: 'opacity 0.25s ease',
          pointerEvents: sheetExpanded ? 'all' : 'none',
        }}>
          {/* Overlay modes */}
          <div>
            <div style={{ color: 'rgba(255,255,255,0.28)', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
              Overlay Mode
            </div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {OVERLAY_MODES.map(m => (
                <button key={m.id} onClick={() => onOverlayMode(m.id)} style={{
                  background: overlayMode === m.id ? m.color + '22' : 'rgba(255,255,255,0.04)',
                  color: overlayMode === m.id ? m.color : 'rgba(255,255,255,0.45)',
                  border: `1px solid ${overlayMode === m.id ? m.color + '88' : 'rgba(255,255,255,0.07)'}`,
                  borderRadius: 8, padding: '5px 10px', fontSize: '0.72rem', cursor: 'pointer',
                  transition: 'all 0.15s', minHeight: 32,
                }}>{m.label}</button>
              ))}
            </div>
          </div>

          {/* Cities */}
          <div>
            <div style={{ color: 'rgba(255,255,255,0.28)', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
              Cities
            </div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {(locations || []).map(loc => (
                <button key={loc.name} onClick={() => handleSeed(loc.lat, loc.lon, loc.name)} disabled={seeding} style={{
                  background: activeCity === loc.name ? 'rgba(29,78,216,0.35)' : 'rgba(255,255,255,0.04)',
                  color: activeCity === loc.name ? '#60a5fa' : 'rgba(255,255,255,0.5)',
                  border: `1px solid ${activeCity === loc.name ? '#3b82f666' : 'rgba(255,255,255,0.07)'}`,
                  borderRadius: 20, padding: '5px 12px', fontSize: '0.74rem',
                  cursor: seeding ? 'wait' : 'pointer', transition: 'all 0.2s', minHeight: 30,
                }}>{loc.flag} {loc.name}</button>
              ))}
            </div>
          </div>

          {/* Sim speed */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: 'rgba(255,255,255,0.28)', fontSize: '0.65rem', fontWeight: 600, flexShrink: 0 }}>⏩ Speed</span>
            {[1, 2, 5, 10, 20].map(v => (
              <button key={v} onClick={() => handleSpeed(v)} style={{
                background: speed === v ? 'rgba(124,58,237,0.35)' : 'rgba(255,255,255,0.04)',
                color: speed === v ? '#a855f7' : 'rgba(255,255,255,0.4)',
                border: `1px solid ${speed === v ? '#8b5cf666' : 'rgba(255,255,255,0.07)'}`,
                borderRadius: 8, padding: '4px 10px', fontSize: '0.72rem', cursor: 'pointer',
                minHeight: 32,
              }}>{v}x</button>
            ))}
          </div>

          {/* Grid stats row */}
          {gridData && (
            <div style={{ display: 'flex', gap: 6 }}>
              {[
                { label: 'Avg T',  val: gridData.avgT?.toFixed(1) ?? '—',      unit: '°C',  color: '#f97316' },
                { label: 'Wind',   val: gridData.avgWind?.toFixed(1) ?? '—',   unit: ' m/s', color: '#38bdf8' },
                { label: 'Storms', val: gridData.storms?.length > 0 ? `🌀 ${gridData.storms.length}` : '—', unit: '', color: '#a855f7' },
              ].map(s => (
                <div key={s.label} style={{
                  flex: 1, padding: '6px 8px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10,
                }}>
                  <div style={{ color: 'rgba(255,255,255,0.28)', fontSize: '0.58rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
                  <div style={{ color: s.color, fontWeight: 700, fontSize: '0.88rem', lineHeight: 1.3 }}>{s.val}{s.unit}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )

  // ── DESKTOP ───────────────────────────────────────────────────────────────
  return (
    <>
      {/* Full-width top bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30,
        height: 56, ...GLASS,
        borderTop: 'none', borderLeft: 'none', borderRight: 'none',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', padding: '0 20px', gap: 14,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 200, flexShrink: 0 }}>
          <span style={{ fontSize: '1.4rem' }}>{condIcon}</span>
          <div>
            <div style={{ color: '#f1f5f9', fontWeight: 700, fontSize: '0.92rem', letterSpacing: '-0.01em', lineHeight: 1.25 }}>
              Weather Simulation
            </div>
            <div style={{ color: 'rgba(255,255,255,0.28)', fontSize: '0.58rem' }}>simulation.micutu.com</div>
          </div>
        </div>

        {/* Search — center */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <SearchBar
            onSelect={(lat, lon, name) => { onSearchSelect(lat, lon, name); setActiveCity(name) }}
            isMobile={false}
          />
        </div>

        {/* Overlay mode pills */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
          {OVERLAY_MODES.map(m => (
            <button key={m.id} onClick={() => onOverlayMode(m.id)} style={{
              whiteSpace: 'nowrap',
              background: overlayMode === m.id ? m.color + '22' : 'transparent',
              color: overlayMode === m.id ? m.color : 'rgba(255,255,255,0.38)',
              border: `1px solid ${overlayMode === m.id ? m.color + '66' : 'rgba(255,255,255,0.06)'}`,
              borderRadius: 999, padding: '3px 10px', fontSize: '0.7rem', cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}>{m.label}</button>
          ))}
        </div>

        <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.07)', flexShrink: 0 }} />

        {/* Status dot */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor, boxShadow: `0 0 6px ${statusColor}` }} />
          <span style={{ color: statusColor, fontSize: '0.68rem', fontWeight: 600 }}>{status}</span>
        </div>
      </div>

      {/* Bottom center: cities + speed */}
      <div style={{
        position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
        zIndex: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
      }}>
        <div style={{ ...GLASS, borderRadius: 999, padding: '7px 14px', display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
          {(locations || []).map(loc => (
            <button key={loc.name} onClick={() => handleSeed(loc.lat, loc.lon, loc.name)} disabled={seeding} style={{
              background: activeCity === loc.name ? 'rgba(29,78,216,0.35)' : 'transparent',
              color: activeCity === loc.name ? '#60a5fa' : 'rgba(255,255,255,0.42)',
              border: `1px solid ${activeCity === loc.name ? '#3b82f666' : 'transparent'}`,
              borderRadius: 20, padding: '3px 11px', fontSize: '0.72rem',
              cursor: seeding ? 'wait' : 'pointer', transition: 'all 0.18s',
            }}>{loc.flag} {loc.name}</button>
          ))}
        </div>

        <div style={{ ...GLASS, borderRadius: 20, padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.65rem', fontWeight: 600 }}>SPEED</span>
          {[1, 2, 5, 10, 20].map(v => (
            <button key={v} onClick={() => handleSpeed(v)} style={{
              background: speed === v ? 'rgba(124,58,237,0.35)' : 'transparent',
              color: speed === v ? '#a855f7' : 'rgba(255,255,255,0.35)',
              border: `1px solid ${speed === v ? '#8b5cf666' : 'rgba(255,255,255,0.06)'}`,
              borderRadius: 8, padding: '2px 9px', fontSize: '0.72rem', cursor: 'pointer',
              transition: 'all 0.15s',
            }}>{v}x</button>
          ))}
          <span style={{ color: 'rgba(255,255,255,0.08)', margin: '0 2px' }}>│</span>
          <span style={{ color: seeding ? '#38bdf8' : 'rgba(255,255,255,0.28)', fontSize: '0.68rem', minWidth: 84 }}>
            {seeding ? '⟳ Seeding…' : activeCity ? `📍 ${activeCity}` : '🌐 Click globe'}
          </span>
        </div>
      </div>
    </>
  )
}
