import { useState, useCallback } from 'react'

const EVENTS = [
  { id: 'cyclone',       icon: '🌀', label: 'Cyclone',       color: '#a855f7', desc: 'Drop pressure + rotating winds' },
  { id: 'heat_dome',     icon: '��️', label: 'Heat Dome',     color: '#f97316', desc: 'Inject +18°C + high pressure'   },
  { id: 'cold_outbreak', icon: '❄️', label: 'Cold Outbreak', color: '#60a5fa', desc: 'Inject -22°C cold air mass'       },
  { id: 'blocking_high', icon: '🔵', label: 'Blocking High', color: '#34d399', desc: 'Strong anticyclone + dry air'     },
]

export default function EventPanel({ onStartPlacement, placementMode, isMobile }) {
  const [expanded, setExpanded] = useState(false)
  const [selected, setSelected] = useState(null)

  const handleSelect = useCallback((eventId) => {
    setSelected(eventId)
    onStartPlacement(eventId)
  }, [onStartPlacement])

  const cancelPlacement = useCallback(() => {
    setSelected(null)
    onStartPlacement(null)
  }, [onStartPlacement])

  // Mobile: compact horizontal strip
  if (isMobile) return (
    <div style={{
      display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none',
      padding: '0 12px 4px',
    }}>
      {EVENTS.map(ev => (
        <button key={ev.id} onClick={() => selected === ev.id ? cancelPlacement() : handleSelect(ev.id)} style={{
          whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4,
          background: selected === ev.id ? ev.color + '33' : '#1e293bcc',
          border: `1px solid ${selected === ev.id ? ev.color : '#334155'}`,
          color: selected === ev.id ? ev.color : '#94a3b8',
          borderRadius: 16, padding: '5px 12px', fontSize: '0.75rem',
          cursor: 'pointer', backdropFilter: 'blur(6px)',
          animation: selected === ev.id ? 'pulse 1s infinite' : 'none',
        }}>
          {ev.icon} {ev.label}
        </button>
      ))}
      {selected && (
        <div style={{
          display: 'flex', alignItems: 'center', whiteSpace: 'nowrap',
          color: '#f59e0b', fontSize: '0.72rem', padding: '0 8px',
        }}>
          👆 Tap globe to place
        </div>
      )}
    </div>
  )

  // Desktop: vertical panel on the left
  return (
    <div style={{
      position: 'absolute', left: 20, top: '50%', transform: 'translateY(-50%)',
      zIndex: 20, display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      {/* Toggle button */}
      <button onClick={() => setExpanded(e => !e)} style={{
        width: 44, height: 44, borderRadius: 12,
        background: expanded ? '#1d4ed8cc' : '#0f172aee',
        border: `1px solid ${expanded ? '#3b82f6' : '#1e293b'}`,
        color: '#e2e8f0', fontSize: '1.2rem', cursor: 'pointer',
        backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 2px 16px #00000055',
        title: 'Weather Events',
      }}>⚡</button>

      {expanded && (
        <div style={{
          background: '#0f172aee', border: '1px solid #1e293b', borderRadius: 16,
          padding: '12px 10px', backdropFilter: 'blur(12px)',
          display: 'flex', flexDirection: 'column', gap: 6,
          boxShadow: '0 4px 24px #00000077',
          minWidth: 170,
        }}>
          <div style={{ color: '#475569', fontSize: '0.68rem', textTransform: 'uppercase',
            letterSpacing: '0.1em', paddingBottom: 4, borderBottom: '1px solid #1e293b' }}>
            ⚡ Inject Event
          </div>
          {EVENTS.map(ev => (
            <button key={ev.id} onClick={() => selected === ev.id ? cancelPlacement() : handleSelect(ev.id)} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
              background: selected === ev.id ? ev.color + '22' : 'transparent',
              border: `1px solid ${selected === ev.id ? ev.color : '#1e293b'}`,
              color: selected === ev.id ? ev.color : '#94a3b8',
              borderRadius: 10, padding: '7px 10px', cursor: 'pointer',
              textAlign: 'left', transition: 'all 0.15s',
            }}
              onMouseEnter={e => { if (selected !== ev.id) { e.currentTarget.style.background = '#1e293b'; e.currentTarget.style.borderColor = ev.color + '66' } }}
              onMouseLeave={e => { if (selected !== ev.id) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = '#1e293b' } }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: '0.82rem' }}>
                <span>{ev.icon}</span>
                <span>{ev.label}</span>
              </div>
              <div style={{ fontSize: '0.65rem', color: selected === ev.id ? ev.color + 'aa' : '#334155', marginTop: 2 }}>
                {ev.desc}
              </div>
            </button>
          ))}
          {selected && (
            <div style={{
              marginTop: 4, padding: '8px 10px', background: '#f59e0b11',
              border: '1px solid #f59e0b44', borderRadius: 8,
              color: '#f59e0b', fontSize: '0.72rem', textAlign: 'center',
            }}>
              🖱️ Click globe to place<br/>
              <span style={{ fontSize: '0.65rem', color: '#78350f' }}>or click event again to cancel</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
