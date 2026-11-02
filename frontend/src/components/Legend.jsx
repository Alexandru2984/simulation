import { legendGradient, SCALES, tickPosition } from '../utils/colorScales'
import { convertTemperature, TEMPERATURE_UNITS, WIND_UNITS } from '../utils/units'
import { useI18n } from '../i18n/react'

function tickLabel(id, value, prefs) {
  const scale = SCALES[id]
  if (scale.quantity === 'temperature') return Math.round(convertTemperature(value, prefs.tempUnit))
  return scale.format ? scale.format(value) : value
}

export default function Legend({ mode, prefs, className = '' }) {
  const { t } = useI18n()
  if (mode === 'none') return null

  if (mode === 'wind') {
    const unit = WIND_UNITS[prefs.windUnit] ?? WIND_UNITS.ms
    return (
      <section className={`legend glass ${className}`} aria-label={t('legend.label')}>
        <div className="legend__head">
          <span className="legend__title">{t('legend.wind')}</span>
          <span className="legend__unit">{unit.label}</span>
        </div>
        <p className="legend__note">
          {t('legend.windNote', { max: Math.round(unit.convert(20)), unit: unit.label })}
        </p>
      </section>
    )
  }

  const scale = SCALES[mode]
  if (!scale) return null
  const unit = scale.quantity === 'temperature'
    ? (TEMPERATURE_UNITS[prefs.tempUnit] ?? TEMPERATURE_UNITS.c).label
    : scale.unit === 'index' ? t('scale.indexUnit') : scale.unit
  const title = t(`scale.${mode}`)

  return (
    <section className={`legend glass ${className}`} aria-label={t('legend.scale', { title })}>
      <div className="legend__head">
        <span className="legend__title">{title}</span>
        <span className="legend__unit">{unit}</span>
      </div>
      <div className="legend__bar" style={{ background: legendGradient(mode) }} role="img"
        aria-label={t('legend.range', { min: tickLabel(mode, scale.min, prefs), max: tickLabel(mode, scale.max, prefs), unit })} />
      <div className="legend__ticks" aria-hidden="true">
        {scale.ticks.map(value => {
          const at = tickPosition(mode, value)
          // Centre labels on their tick; only labels at the very ends hug the edge.
          const shift = at < 0.04 ? '0' : at > 0.96 ? '-100%' : '-50%'
          return (
            <span key={value} style={{ left: `${at * 100}%`, transform: `translateX(${shift})` }}>
              {tickLabel(mode, value, prefs)}
            </span>
          )
        })}
      </div>
    </section>
  )
}
