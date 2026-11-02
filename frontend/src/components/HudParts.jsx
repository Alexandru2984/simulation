import { useEffect, useRef, useState } from 'react'
import { flagFor, LAYERS, SPEEDS, STATUS_COLORS } from '../constants'
import { useI18n } from '../i18n/react'
import { pressureAnomalyLabel } from '../utils/weatherFeatures'
import { formatLatLon, formatPressure, formatWind } from '../utils/units'
import Icon from './Icon'

export function StatusIndicator({ status, compact = false }) {
  const { t } = useI18n()
  const color = STATUS_COLORS[status] ?? '#64748b'
  const label = t(`status.${status}`)
  return (
    <span className="status" style={{ '--dot': color }} role="status" aria-live="polite"
      title={t('status.title', { status: label })}>
      <span className="status-dot" aria-hidden="true" />
      {compact ? <span className="sr-only">{label}</span> : label}
    </span>
  )
}

// Radio-group keyboard model (WAI-ARIA APG): one tab stop for the group,
// arrow keys move and select, Home/End jump to the ends.
const RADIO_STEP = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }

function radioKeyDown(event, values, current, onChange) {
  const step = RADIO_STEP[event.key]
  const edge = event.key === 'Home' ? 0 : event.key === 'End' ? values.length - 1 : undefined
  if (step === undefined && edge === undefined) return
  event.preventDefault()
  const index = Math.max(0, values.indexOf(current))
  const next = edge ?? (index + step + values.length) % values.length
  onChange(values[next])
  event.currentTarget.querySelectorAll('[role="radio"]')[next]?.focus()
}

const LAYER_IDS = LAYERS.map(layer => layer.id)

export function LayerSwitcher({ value, onChange, showLabels = true, className = 'layers' }) {
  const { t } = useI18n()
  const tabStop = LAYER_IDS.includes(value) ? value : LAYER_IDS[0]
  return (
    <div className={className} role="radiogroup" aria-label={t('layers.label')}
      onKeyDown={event => radioKeyDown(event, LAYER_IDS, value, onChange)}>
      {LAYERS.map(layer => (
        <button
          key={layer.id}
          type="button"
          role="radio"
          aria-checked={value === layer.id}
          tabIndex={layer.id === tabStop ? 0 : -1}
          className="btn btn--sm layer-btn"
          style={{ '--tone': layer.tone }}
          title={`${t(`layer.${layer.id}`)} (${layer.key})`}
          onClick={() => onChange(layer.id)}
        >
          <span aria-hidden="true">{layer.icon}</span>
          {showLabels && <span className="layer-btn__label">{t(`layer.${layer.id}`)}</span>}
          <span className="sr-only">{t(`layer.${layer.id}`)}</span>
        </button>
      ))}
    </div>
  )
}

// Toggle buttons rather than radios: every change is a rate-limited request
// that affects all viewers, so arrow keys must not fire one per press.
export function SpeedControl({ speed, onChange, disabled }) {
  const { t } = useI18n()
  return (
    <div className="segmented" role="group" aria-label={t('speed.label')}>
      {SPEEDS.map(v => (
        <button key={v} type="button" className="btn btn--sm"
          style={{ '--tone': '#a855f7' }}
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
  const { t } = useI18n()
  if (!locations?.length) return null
  return (
    <div className={className} role="group" aria-label={t('cities.label')}>
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
  const { t } = useI18n()
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
        aria-pressed={tourActive} onClick={onToggleTour} title={t('storms.tourTitle')}>
        🌀 {tourActive ? t('storms.touring', { count }) : t('storms.count', { count })}
      </button>
      <button type="button" className="btn btn--icon glass" style={{ width: 36, height: 36, minHeight: 36, fontSize: '0.9rem' }}
        aria-expanded={open} aria-haspopup="true" aria-label={t('storms.list')} onClick={() => setOpen(o => !o)}>☰</button>
      {open && (
        <div className="popover" style={{ right: 0, [popoverSide === 'up' ? 'bottom' : 'top']: 'calc(100% + 8px)' }}
          role="menu" aria-label={t('storms.active')}>
          <h2 className="eyebrow">{t('storms.active')}</h2>
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
                  <span className="feed__time">{formatPressure(s.P)}<br />{formatWind(s.wind, prefs.windUnit, 0)}</span>
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
  const { t } = useI18n()
  return (
    <div className={`toolbar glass${vertical ? ' toolbar--vertical' : ''}`} role="toolbar" aria-label={t('toolbar.label')}>
      <button type="button" className="btn btn--icon btn--ghost" onClick={() => api.current?.zoom(-1)} aria-label={t('toolbar.zoomIn')} title={t('toolbar.zoomInTitle')}><Icon name="plus" /></button>
      <button type="button" className="btn btn--icon btn--ghost" onClick={() => api.current?.zoom(1)} aria-label={t('toolbar.zoomOut')} title={t('toolbar.zoomOutTitle')}><Icon name="minus" /></button>
      <button type="button" className="btn btn--icon btn--ghost" onClick={() => api.current?.reset()} aria-label={t('toolbar.reset')} title={t('toolbar.resetTitle')}><Icon name="reset" /></button>
      <button type="button" className="btn btn--icon btn--ghost" onClick={() => api.current?.screenshot()} aria-label={t('toolbar.screenshot')} title={t('toolbar.screenshotTitle')}><Icon name="camera" /></button>
      {onShare && <button type="button" className="btn btn--icon btn--ghost" onClick={onShare} aria-label={t('toolbar.share')} title={t('toolbar.shareTitle')}><Icon name="link" /></button>}
      {fullscreen.supported && (
        <button type="button" className="btn btn--icon btn--ghost" onClick={fullscreen.toggle}
          aria-pressed={fullscreen.active} aria-label={fullscreen.active ? t('toolbar.fullscreenExit') : t('toolbar.fullscreenEnter')}
          title={t('toolbar.fullscreenTitle')}><Icon name={fullscreen.active ? 'compress' : 'expand'} /></button>
      )}
    </div>
  )
}
