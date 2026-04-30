import { useState, useCallback } from 'react'

const EVENTS = [
  { id: 'cyclone',       icon: '🌀', label: 'Cyclone',   color: '#a855f7', desc: 'Drop pressure + rotating winds' },
  { id: 'heat_dome',     icon: '🌡️', label: 'Heat Dome', color: '#f97316', desc: 'Inject +18°C + high pressure'   },
  { id: 'cold_outbreak', icon: '❄️', label: 'Cold Air',  color: '#60a5fa', desc: 'Inject -22°C cold air mass'      },
  { id: 'blocking_high', icon: '🔵', label: 'Blocking',  color: '#34d399', desc: 'Strong anticyclone + dry air'    },
  { id: 'tornado',       icon: '🌪️', label: 'Tornado',   color: '#fbbf24', desc: 'Intense vortex + pressure drop' },
]

const GLASS = {
  background: 'rgba(10,15,30,0.82)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: '1px solid rgba(255,255,255,0.08)',
}

export default function EventPanel({ onStartPlacement, placementMode, isMobile }) {
  const [expanded, setExpanded] = useState(false)
  const [selected, setSelected] = useState(null)

  const handleSelect = useCallback(id => {
    setSelected(id)
    onStartPlacement(id)
  }, [onStartPlacement])

  const cancelPlacement = useCallback(() => {
    setSelected(null)
    onStartPlacement(null)
  }, [onStartPlacement])

  // Mobile: compact horizontal icon strip (used inside WeatherHUD bottom sheet)
  if (isMobile) return (
    <div style={{ display: 'flex', gap: 6, padding: '0 12px 4px', overflowX: 'auto', scrollbarWidth: 'none' }}>
      {EVENTS.map(ev => (
        <button key={ev.id} onClick={() => selected === ev.id ? cancelPlacement() : handleSelect(ev.id)} style={{
          whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5,
          background: selected === ev.id ? ev.color + '22' : 'rgba(255,255,255,0.04)',
          border: `1px solid ${selected === ev.id ? ev.color : 'rgba(255,255,255,0.07)'}`,
          color: selected === ev.id ? ev.color : 'rgba(255,255,255,0.5)',
          borderRadius: 20, padding: '5px 12px', fontSize: '0.74rem',
          cursor: 'pointer', minHeight: 34,
          transition: 'all 0.2s ease',
        }}>
          {ev.icon} {ev.label}
        </button>
      ))}
    </div>
  )

  // Desktop: left-side collapsible panel with circular toggle
  return (
    <div style={{
      position: 'absolute', left: 20, top: '50%', transform: 'translateY(-50%)',
      zIndex: 20, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8,
    }}>
      {/* Circular toggle ⚡ */}
      <button
        onClick={() => setExpanded(e => !e)}
        title="Inject Weather Event"
        style={{
          width: 44, height: 44, borderRadius: '50%', cursor: 'pointer',
          ...GLASS,
          background: expanded ? 'rgba(139,92,246,0.22)' : 'rgba(10,15,30,0.82)',
          border: `1px solid ${expanded ? '#8b5cf6' : 'rgba(255,255,255,0.08)'}`,
          color: expanded ? '#a855f7' : 'rgba(255,255,255,0.55)',
          fontSize: '1.1rem',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: expanded ? '0 0 18px rgba(139,92,246,0.25)' : '0 2px 16px rgba(0,0,0,0.4)',
          transition: 'all 0.2s ease',
        }}
      >⚡</button>

      {expanded && (
        <div style={{
          ...GLASS,
          borderRadius: 16,
          padding: '12px',
          width: 192,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
          <div style={{
            color: 'rgba(255,255,255,0.3)', fontSize: '0.62rem', textTransform: 'uppercase',
            letterSpacing: '0.1em', paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.06)',
            marginBottom: 8,
          }}>
            ⚡ Inject Event
          </div>

          {/* 2-column grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {EVENTS.map((ev, idx) => (
              <button
                key={ev.id}
                onClick={() => selected === ev.id ? cancelPlacement() : handleSelect(ev.id)}
                title={ev.desc}
                style={{
                  gridColumn: idx === 4 ? 'span 2' : undefined,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  background: selected === ev.id ? ev.color + '1a' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${selected === ev.id ? ev.color : 'rgba(255,255,255,0.07)'}`,
                  color: selected === ev.id ? ev.color : 'rgba(255,255,255,0.55)',
                  borderRadius: 12, padding: '10px 6px', cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  animation: selected === ev.id ? 'pulse 1s infinite' : 'none',
                }}
                onMouseEnter={e => {
                  if (selected !== ev.id) {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.07)'
                    e.currentTarget.style.borderColor = ev.color + '55'
                  }
                }}
                onMouseLeave={e => {
                  if (selected !== ev.id) {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'
                  }
                }}
              >
                <span style={{ fontSize: '1.35rem' }}>{ev.icon}</span>
                <span style={{ fontWeight: 600, fontSize: '0.7rem', lineHeight: 1 }}>{ev.label}</span>
              </button>
            ))}
          </div>

          {selected && (
            <div style={{
              marginTop: 8, padding: '7px 10px',
              background: 'rgba(245,158,11,0.07)',
              border: '1px solid rgba(245,158,11,0.28)',
              borderRadius: 8, color: '#f59e0b', fontSize: '0.68rem', textAlign: 'center',
            }}>
              🖱️ Click globe to place
            </div>
          )}
        </div>
      )}
    </div>
  )
}
