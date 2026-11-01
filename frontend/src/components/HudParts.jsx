import { useEffect, useRef, useState } from 'react'
import { flagFor, LAYERS, SPEEDS, STATUS_COLORS, STATUS_LABELS } from '../constants'
import { pressureAnomalyLabel } from '../utils/weatherFeatures'
import { formatLatLon, formatWind } from '../utils/units'
import Icon from './Icon'

export function StatusIndicator({ status, compact = false }) {
  const color = STATUS_COLORS[status] ?? '#64748b'
  const label = STATUS_LABELS[status] ?? status
  return (
    <span className="status" style={{ '--dot': color }} role="status" aria-live="polite"
      title={`Connection: ${label}`}>
      <span className="status-dot" aria-hidden="true" />
      {compact ? <span className="sr-only">{label}</span> : label}
    </span>
  )
}

export function LayerSwitcher({ value, onChange, showLabels = true, className = 'layers' }) {
  return (
    <div className={className} role="radiogroup" aria-label="Map layer">
      {LAYERS.map(layer => (
        <button
          key={layer.id}
          type="button"
          role="radio"
          aria-checked={value === layer.id}
          aria-pressed={value === layer.id}
          className="btn btn--sm layer-btn"
          style={{ '--tone': layer.tone }}
          title={`${layer.label} (${layer.key})`}
          onClick={() => onChange(layer.id)}
        >
          <span aria-hidden="true">{layer.icon}</span>
          {showLabels && <span className="layer-btn__label">{layer.label}</span>}
          <span className="sr-only">{layer.label}</span>
        </button>
      ))}
    </div>
  )
}

export function SpeedControl({ speed, onChange, disabled }) {
  return (
    <div className="segmented" role="radiogroup" aria-label="Simulation speed">
      {SPEEDS.map(v => (
        <button key={v} type="button" role="radio" className="btn btn--sm"
          style={{ '--tone': '#a855f7' }}
          aria-checked={Math.abs(speed - v) < 1e-6}
          aria-pressed={Math.abs(speed - v) < 1e-6}
          disabled={disabled}
          onClick={() => onChange(v)}>
          {v}×
        </button>
      ))}
    </div>
  )
}

export function CityChips({ locations, activeCity, onSelect, busy, className = 'chips' }) {
  if (!locations?.length) return null
  return (
    <div className={className} role="group" aria-label="Seed the HUD from a city">
      {locations.map(loc => (
        <button key={loc.name} type="button" className="btn btn--sm chip"
          aria-pressed={activeCity === loc.name} disabled={busy}
          onClick={() => onSelect(loc.lat, loc.lon, loc.name)}>
          <span aria-hidden="true">{flagFor(loc.country)}</span> {loc.name}
        </button>
      ))}
    </div>
  )
}

// Storm tour toggle plus a popover listing every detected storm.
export function StormControls({ storms, tourActive, onToggleTour, onFocus, prefs, popoverSide = 'up' }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  const count = storms?.length ?? 0

  useEffect(() => {
    if (!open) return undefined
    const onDown = e => { if (!wrapRef.current?.contains(e.target)) setOpen(false) }
    const onKey = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => { if (count === 0) setOpen(false) }, [count])
  if (count === 0) return null

  const sorted = [...storms].sort((a, b) => (a.anom ?? 0) - (b.anom ?? 0)).slice(0, 10)

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'flex', gap: 6 }}>
      <button type="button" className="btn glass" style={{ '--tone': '#a855f7', animation: tourActive ? 'tour-pulse 2s ease-in-out infinite' : 'none' }}
        aria-pressed={tourActive} onClick={onToggleTour} title="Fly between active storms (T)">
        🌀 {tourActive ? `Touring ${count}` : `${count} storm${count > 1 ? 's' : ''}`}
      </button>
      <button type="button" className="btn btn--icon glass" style={{ width: 36, height: 36, minHeight: 36, fontSize: '0.9rem' }}
        aria-expanded={open} aria-haspopup="true" aria-label="List active storms" onClick={() => setOpen(o => !o)}>☰</button>
      {open && (
        <div className="popover" style={{ right: 0, [popoverSide === 'up' ? 'bottom' : 'top']: 'calc(100% + 8px)' }}
          role="menu" aria-label="Active storms">
          <h2 className="eyebrow">Active storms</h2>
          <ul className="feed">
            {sorted.map(s => (
              <li key={`${s.lat}_${s.lon}`}>
                <button type="button" role="menuitem" className="feed__item"
                  onClick={() => { onFocus(s.lat, s.lon); setOpen(false) }}>
                  <span aria-hidden="true">🌀</span>
                  <span>
                    <strong style={{ color: 'var(--text)' }}>{pressureAnomalyLabel(s.anom)}</strong>
                    <br />{formatLatLon(s.lat, s.lon, 0)}
                  </span>
                  <span className="feed__time">{Math.round(s.P)} hPa<br />{formatWind(s.wind, prefs.windUnit, 0)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export function GlobeToolbar({ api, vertical = false, fullscreen, onShare }) {
  return (
    <div className={`toolbar glass${vertical ? ' toolbar--vertical' : ''}`} role="toolbar" aria-label="Globe controls">
      <button type="button" className="btn btn--icon btn--ghost" onClick={() => api.current?.zoom(-1)} aria-label="Zoom in" title="Zoom in (+)"><Icon name="plus" /></button>
      <button type="button" className="btn btn--icon btn--ghost" onClick={() => api.current?.zoom(1)} aria-label="Zoom out" title="Zoom out (−)"><Icon name="minus" /></button>
      <button type="button" className="btn btn--icon btn--ghost" onClick={() => api.current?.reset()} aria-label="Reset view" title="Reset view (R)"><Icon name="reset" /></button>
      <button type="button" className="btn btn--icon btn--ghost" onClick={() => api.current?.screenshot()} aria-label="Save screenshot" title="Save screenshot (S)"><Icon name="camera" /></button>
      {onShare && <button type="button" className="btn btn--icon btn--ghost" onClick={onShare} aria-label="Share this view" title="Copy a link to this view"><Icon name="link" /></button>}
      {fullscreen.supported && (
        <button type="button" className="btn btn--icon btn--ghost" onClick={fullscreen.toggle}
          aria-pressed={fullscreen.active} aria-label={fullscreen.active ? 'Exit fullscreen' : 'Enter fullscreen'}
          title="Fullscreen (F)"><Icon name={fullscreen.active ? 'compress' : 'expand'} /></button>
      )}
    </div>
  )
}
