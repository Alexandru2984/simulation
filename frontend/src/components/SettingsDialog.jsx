import Dialog from './Dialog'
import { QUALITY_LEVELS } from '../hooks/usePreferences'
import { TEMPERATURE_UNITS, WIND_UNITS } from '../utils/units'

const QUALITY_LABELS = { auto: 'Auto', low: 'Battery saver', high: 'High detail' }

function Choice({ label, options, value, onChange }) {
  return (
    <div className="field" role="group" aria-label={label}>
      <span className="field__label">{label}</span>
      <div className="segmented">
        {options.map(([id, text, title]) => (
          <button key={id} type="button" className="btn btn--sm" title={title}
            aria-pressed={value === id} onClick={() => onChange(id)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function SettingsDialog({ prefs, onChange, onClose }) {
  return (
    <Dialog title="Settings" onClose={onClose}>
      <Choice
        label="Temperature"
        value={prefs.tempUnit}
        onChange={tempUnit => onChange({ tempUnit })}
        options={Object.entries(TEMPERATURE_UNITS).map(([id, u]) => [id, u.label, u.name])}
      />
      <Choice
        label="Wind speed"
        value={prefs.windUnit}
        onChange={windUnit => onChange({ windUnit })}
        options={Object.entries(WIND_UNITS).map(([id, u]) => [id, u.label, u.name])}
      />
      <Choice
        label="Graphics quality"
        value={prefs.quality}
        onChange={quality => onChange({ quality })}
        options={QUALITY_LEVELS.map(id => [id, QUALITY_LABELS[id]])}
      />
      <label className="switch">
        <span>Slowly rotate the globe when idle</span>
        <input type="checkbox" checked={prefs.autoRotate}
          onChange={e => onChange({ autoRotate: e.target.checked })} />
      </label>
      <p className="muted" style={{ marginTop: 14 }}>
        Settings are stored only in this browser.
      </p>
    </Dialog>
  )
}
