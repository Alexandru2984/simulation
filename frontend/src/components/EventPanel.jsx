import { useId } from 'react'
import { EVENTS } from '../constants'

export function IntensitySlider({ value, onChange }) {
  const id = useId()
  const label = value < 0.75 ? 'Mild' : value < 1.5 ? 'Moderate' : value < 2.25 ? 'Strong' : 'Extreme'
  return (
    <div className="intensity">
      <div className="intensity__row">
        <label htmlFor={id}>Intensity</label>
        <span>{label} · {value.toFixed(2)}×</span>
      </div>
      <input id={id} className="range" type="range" min={0.25} max={3} step={0.25}
        value={value} onChange={e => onChange(Number(e.target.value))} />
    </div>
  )
}

// Desktop / tablet: collapsible panel docked on the left edge.
export default function EventPanel({ open, onToggle, placementMode, onStartPlacement, intensity, onIntensity }) {
  const panelId = useId()
  return (
    <div className="dock-left">
      <button
        type="button"
        className="btn btn--icon event-toggle glass"
        aria-expanded={open}
        aria-controls={panelId}
        aria-pressed={open}
        title="Inject a weather event (E)"
        onClick={onToggle}
      >
        <span aria-hidden="true">⚡</span>
        <span className="sr-only">Inject a weather event</span>
      </button>

      {open && (
        <section id={panelId} className="glass panel event-panel" aria-label="Inject a weather event">
          <h2 className="eyebrow">Inject event</h2>
          <div className="event-grid">
            {EVENTS.map((ev, idx) => (
              <button
                key={ev.id}
                type="button"
                className={`btn event-btn${idx === EVENTS.length - 1 ? ' event-btn--wide' : ''}`}
                style={{ '--tone': ev.tone }}
                aria-pressed={placementMode === ev.id}
                title={ev.desc}
                onClick={() => onStartPlacement(placementMode === ev.id ? null : ev.id)}
              >
                <span className="event-btn__icon" aria-hidden="true">{ev.icon}</span>
                {ev.label}
              </button>
            ))}
          </div>
          <IntensitySlider value={intensity} onChange={onIntensity} />
          {placementMode && <div className="hint" role="status">Click the globe to place it</div>}
        </section>
      )}
    </div>
  )
}
