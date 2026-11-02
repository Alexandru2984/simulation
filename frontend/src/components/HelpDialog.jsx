import Dialog from './Dialog'
import { LAYERS } from '../constants'
import { useI18n } from '../i18n/react'

// [keys, help.key.<id>]
const SHORTCUTS = [
  [['1', '–', '7'], 'layer'],
  [['/'], 'search'],
  [['E'], 'events'],
  [['T'], 'tour'],
  [['R'], 'reset'],
  [['+', '−'], 'zoom'],
  [['F'], 'fullscreen'],
  [['S'], 'screenshot'],
  [['L'], 'live'],
  [['Esc'], 'escape'],
  [['?'], 'help'],
]

const DRIVERS = ['sun', 'wind', 'heat', 'obs', 'storm']

export default function HelpDialog({ onClose }) {
  const { lang, t } = useI18n()
  // Split around {link} so the link stays a real element in any language.
  const [beforeLink, afterLink = ''] = t('help.privacy', { link: '\u0000' }).split('\u0000')
  return (
    <Dialog title={t('help.title')} onClose={onClose}>
      <p>{t('help.intro')}</p>

      <h3>{t('help.drivesHeading')}</h3>
      <ul>
        {DRIVERS.map(id => (
          <li key={id}><strong>{t(`help.${id}Title`)}</strong> {t(`help.${id}Text`)}</li>
        ))}
      </ul>

      <h3>{t('help.tryHeading')}</h3>
      <ul>
        {[1, 2, 3, 4].map(n => <li key={n}>{t(`help.try${n}`)}</li>)}
      </ul>

      <h3>{t('help.keysHeading')}</h3>
      <div className="shortcuts">
        {SHORTCUTS.map(([keys, id]) => (
          <div key={id} style={{ display: 'contents' }}>
            <span>{keys.map(k => k === '–' ? ' – ' : <kbd key={k} className="kbd">{k}</kbd>)}</span>
            <span>{t(`help.key.${id}`)}</span>
          </div>
        ))}
      </div>
      <p className="muted" style={{ marginTop: 14 }}>
        {t('help.layers', { list: LAYERS.map(l => `${l.key} ${t(`layer.${l.id}`)}`).join(' · ') })}
      </p>

      <h3>{t('help.finePrintHeading')}</h3>
      <p>{t('help.finePrint')}</p>
      <p>
        {beforeLink}<a href={lang === 'en' ? '/privacy' : `/privacy#${lang}`}>{t('help.privacyLink')}</a>{afterLink}
      </p>
    </Dialog>
  )
}
