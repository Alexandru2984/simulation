import { EVENT_BY_ID } from '../constants'
import { formatLatLon, formatRelativeTime } from '../utils/units'
import { useI18n } from '../i18n/react'

// Recent injections by anyone viewing the shared world.
export default function EventFeed({ events, serverTime, onFocus, limit = 4 }) {
  const { t } = useI18n()
  if (!Array.isArray(events) || events.length === 0) {
    return <p className="muted" style={{ margin: 0 }}>{t('feed.empty')}</p>
  }
  return (
    <ul className="feed" aria-label={t('feed.recent')}>
      {events.slice(0, limit).map(ev => {
        const meta = EVENT_BY_ID[ev.type]
        if (!meta) return null
        return (
          <li key={ev.id}>
            <button type="button" className="feed__item" onClick={() => onFocus?.(ev.lat, ev.lon)}
              title={t('feed.flyTo', { place: formatLatLon(ev.lat, ev.lon) })}>
              <span aria-hidden="true">{meta.icon}</span>
              <span>{t(`event.${ev.type}`)} · {formatLatLon(ev.lat, ev.lon, 0)}</span>
              <span className="feed__time">{formatRelativeTime((serverTime ?? 0) - ev.time)}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
