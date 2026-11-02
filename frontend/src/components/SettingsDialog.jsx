import Dialog from './Dialog'
import { QUALITY_LEVELS } from '../hooks/usePreferences'
import { LANGUAGES } from '../i18n/i18n.js'
import { useI18n } from '../i18n/react'
import { TEMPERATURE_UNITS, WIND_UNITS } from '../utils/units'

function Choice({ label, options, value, onChange }) {
  return (
    <div className="field" role="group" aria-label={label}>
      <span className="field__label">{label}</span>
      <div className="segmented">
        {options.map(([id, text, title, lang]) => (
          <button key={id} type="button" className="btn btn--sm" title={title} lang={lang}
            aria-pressed={value === id} onClick={() => onChange(id)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function SettingsDialog({ prefs, onChange, onClose }) {
  const { t } = useI18n()
  return (
    <Dialog title={t('settings.title')} onClose={onClose}>
      <Choice
        label={t('settings.language')}
        value={prefs.lang}
        onChange={lang => onChange({ lang })}
        options={[
          ['auto', t('settings.languageAuto'), t('settings.languageAutoTitle')],
          // Each language is named in itself, so it is findable from any UI language.
          ...LANGUAGES.map(({ id, name }) => [id, name, undefined, id]),
        ]}
      />
      <Choice
        label={t('settings.temperature')}
        value={prefs.tempUnit}
        onChange={tempUnit => onChange({ tempUnit })}
        options={Object.entries(TEMPERATURE_UNITS).map(([id, u]) => [id, u.label, t(`unit.${id}`)])}
      />
      <Choice
        label={t('settings.wind')}
        value={prefs.windUnit}
        onChange={windUnit => onChange({ windUnit })}
        options={Object.entries(WIND_UNITS).map(([id, u]) => [id, u.label, t(`unit.${id}`)])}
      />
      <Choice
        label={t('settings.quality')}
        value={prefs.quality}
        onChange={quality => onChange({ quality })}
        options={QUALITY_LEVELS.map(id => [id, t(`quality.${id}`)])}
      />
      <label className="switch">
        <span>{t('settings.autoRotate')}</span>
        <input type="checkbox" checked={prefs.autoRotate}
          onChange={e => onChange({ autoRotate: e.target.checked })} />
      </label>
      <p className="muted" style={{ marginTop: 14 }}>
        {t('settings.stored')}
      </p>
    </Dialog>
  )
}
