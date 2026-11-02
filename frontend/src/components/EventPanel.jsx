import { useId } from 'react'
import { EVENTS } from '../constants'
import { useI18n } from '../i18n/react'
import { formatNumber } from '../utils/units'

export function IntensitySlider({ value, onChange }) {
  const { t } = useI18n()
  const id = useId()
  const level = value < 0.75 ? 'mild' : value < 1.5 ? 'moderate' : value < 2.25 ? 'strong' : 'extreme'
  return (
    <div className="intensity">
      <div className="intensity__row">
        <label htmlFor={id}>{t('intensity.label')}</label>
        <span>{t(`intensity.${level}`)} · {formatNumber(value, 2)}×</span>
      </div>
      <input id={id} className="range" type="range" min={0.25} max={3} step={0.25}
        value={value} onChange={e => onChange(Number(e.target.value))} />
    </div>
  )
}

// Desktop / tablet: collapsible panel docked on the left edge.
export default function EventPanel({ open, onToggle, placementMode, onStartPlacement, intensity, onIntensity }) {
  const { t } = useI18n()
  const panelId = useId()
  return (
    <div className="dock-left">
      <button
        type="button"
        className="btn btn--icon event-toggle glass"
        aria-expanded={open}
        aria-controls={panelId}
        aria-pressed={open}
        title={t('events.toggleTitle')}
        onClick={onToggle}
      >
        <span aria-hidden="true">⚡</span>
        <span className="sr-only">{t('events.toggle')}</span>
      </button>

      {open && (
        <section id={panelId} className="glass panel event-panel" aria-label={t('events.toggle')}>
          <h2 className="eyebrow">{t('events.heading')}</h2>
          <div className="event-grid">
            {EVENTS.map((ev, idx) => (
              <button
                key={ev.id}
                type="button"
                className={`btn event-btn${idx === EVENTS.length - 1 ? ' event-btn--wide' : ''}`}
                style={{ '--tone': ev.tone }}
                aria-pressed={placementMode === ev.id}
                title={t(`event.${ev.id}.desc`)}
                onClick={() => onStartPlacement(placementMode === ev.id ? null : ev.id)}
              >
                <span className="event-btn__icon" aria-hidden="true">{ev.icon}</span>
                {t(`event.${ev.id}`)}
              </button>
            ))}
          </div>
          <IntensitySlider value={intensity} onChange={onIntensity} />
          {placementMode && <div className="hint" role="status">{t('events.placeHint')}</div>}
        </section>
      )}
    </div>
  )
}
