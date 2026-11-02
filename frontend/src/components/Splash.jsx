import { useI18n } from '../i18n/react'

// Loading / fallback screen. Mirrors the static markup in index.html so the
// hand-off from the server-rendered splash to React is seamless.
export default function Splash({ hidden = false, title, message, action }) {
  const { t } = useI18n()
  return (
    <div className={`splash${hidden ? ' is-hidden' : ''}`} aria-hidden={hidden} role={hidden ? undefined : 'status'}>
      <div className="splash__inner">
        <div className="splash__orb" aria-hidden="true" />
        <h1>{title ?? t('app.title')}</h1>
        <p>{t('app.description')}</p>
        <p className="splash__status">{message ?? t('app.loading')}</p>
        {action}
      </div>
    </div>
  )
}
