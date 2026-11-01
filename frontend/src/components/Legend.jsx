import { legendGradient, SCALES, tickPosition } from '../utils/colorScales'
import { convertTemperature, TEMPERATURE_UNITS, WIND_UNITS } from '../utils/units'

function tickLabel(id, value, prefs) {
  const scale = SCALES[id]
  if (scale.quantity === 'temperature') return Math.round(convertTemperature(value, prefs.tempUnit))
  return scale.format ? scale.format(value) : value
}

export default function Legend({ mode, prefs, className = '' }) {
  if (mode === 'none') return null

  if (mode === 'wind') {
    const unit = WIND_UNITS[prefs.windUnit] ?? WIND_UNITS.ms
    return (
      <section className={`legend glass ${className}`} aria-label="Map legend">
        <div className="legend__head">
          <span className="legend__title">Wind field</span>
          <span className="legend__unit">{unit.label}</span>
        </div>
        <p className="legend__note">
          Arrows point downwind; length grows with speed up to {Math.round(unit.convert(20))} {unit.label}.
        </p>
      </section>
    )
  }

  const scale = SCALES[mode]
  if (!scale) return null
  const unit = scale.quantity === 'temperature'
    ? (TEMPERATURE_UNITS[prefs.tempUnit] ?? TEMPERATURE_UNITS.c).label
    : scale.unit

  return (
    <section className={`legend glass ${className}`} aria-label={`${scale.title} legend`}>
      <div className="legend__head">
        <span className="legend__title">{scale.title}</span>
        <span className="legend__unit">{unit}</span>
      </div>
      <div className="legend__bar" style={{ background: legendGradient(mode) }} role="img"
        aria-label={`Colour scale from ${tickLabel(mode, scale.min, prefs)} to ${tickLabel(mode, scale.max, prefs)} ${unit}`} />
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
