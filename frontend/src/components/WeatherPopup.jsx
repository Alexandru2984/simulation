import { useEffect, useId, useRef, useState } from 'react'
import { EVENTS } from '../constants'
import { apiErrorMessage } from '../utils/api'
import { sampleGrid } from '../utils/geoUtils'
import {
  compassPoint, formatLatLon, formatNumber, formatPercent, formatPressure, formatTemperature,
  formatWind, windFromComponents,
} from '../utils/units'
import { useI18n } from '../i18n/react'

function conditionIcon(code) {
  if (!code) return '🌍'
  if (code >= 200 && code < 300) return '⛈️'
  if (code >= 300 && code < 400) return '🌦️'
  if (code >= 500 && code < 600) return '🌧️'
  if (code >= 600 && code < 700) return '🌨️'
  if (code >= 700 && code < 800) return '🌫️'
  if (code === 800) return '☀️'
  if (code === 801) return '🌤️'
  if (code <= 803) return '⛅'
  return '☁️'
}

// OpenWeatherMap condition groups, for languages its English text can't serve.
function skyKey(code) {
  if (!code) return null
  if (code >= 200 && code < 300) return 'sky.thunderstorm'
  if (code >= 300 && code < 400) return 'sky.drizzle'
  if (code >= 500 && code < 600) return 'sky.rain'
  if (code >= 600 && code < 700) return 'sky.snow'
  if (code >= 700 && code < 800) return 'sky.fog'
  if (code === 800) return 'sky.clear'
  if (code === 801) return 'sky.fewClouds'
  if (code <= 803) return 'sky.clouds'
  return 'sky.overcast'
}

function simulatedAt(grid, lat, lon) {
  if (!grid?.T) return null
  const u = grid.U ? sampleGrid(lat, lon, grid.U) : 0
  const v = grid.V ? sampleGrid(lat, lon, grid.V) : 0
  const wind = windFromComponents(u, v)
  return {
    temp: sampleGrid(lat, lon, grid.T),
    pressure: grid.P ? sampleGrid(lat, lon, grid.P) : null,
    humidity: grid.H ? sampleGrid(lat, lon, grid.H) : null,
    windSpeed: wind.speed,
    windFrom: wind.fromDegrees,
  }
}

export default function WeatherPopup({ lat, lon, grid, prefs, onClose, onInject }) {
  const { lang, t } = useI18n()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const closeRef = useRef(null)
  const titleId = useId()

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setData(null)
    setError(null)
    fetch(`/api/weather/realtime?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`,
      { signal: controller.signal })
      .then(async res => {
        if (!res.ok) throw new Error(await apiErrorMessage(res))
        return res.json()
      })
      .then(d => setData(d))
      .catch(err => {
        if (err.name !== 'AbortError') setError(err.message || t('error.network'))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [lat, lon, t])

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true })
    const onKey = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const sim = simulatedAt(grid, lat, lon)
  const obs = data?.main ? {
    temp: data.main.temp,
    feels: data.main.feels_like,
    pressure: data.main.pressure,
    humidity: Number.isFinite(data.main.humidity) ? data.main.humidity / 100 : null,
    windSpeed: data.wind?.speed,
    windFrom: data.wind?.deg,
  } : null

  const tUnit = prefs.tempUnit
  const w = prefs.windUnit
  const rows = [
    ['temperature', obs && formatTemperature(obs.temp, tUnit), sim && formatTemperature(sim.temp, tUnit)],
    ['pressure', obs && formatPressure(obs.pressure), sim && formatPressure(sim.pressure)],
    ['humidity', obs && formatPercent(obs.humidity), sim && formatPercent(sim.humidity)],
    ['wind', obs && `${formatWind(obs.windSpeed, w)} ${compassPoint(obs.windFrom)}`,
      sim && `${formatWind(sim.windSpeed, w)} ${compassPoint(sim.windFrom)}`],
  ]

  const title = data?.name || (loading ? t('popup.loading') : t('popup.ocean'))
  const condition = data?.weather?.[0]
  const sky = lang === 'en' ? condition?.description : (skyKey(condition?.id) && t(skyKey(condition.id)))

  return (
    <>
      <div className="backdrop backdrop--clear" onClick={onClose} aria-hidden="true" />
      <section className="popup" role="dialog" aria-labelledby={titleId}>
        <div className="popup__head">
          <div className="popup__place">
            <span className="popup__icon" aria-hidden="true">{conditionIcon(data?.weather?.[0]?.id)}</span>
            <div style={{ minWidth: 0 }}>
              <h2 id={titleId} className="popup__name">{title}</h2>
              <div className="popup__meta">
                {[data?.sys?.country, formatLatLon(lat, lon, 2)].filter(Boolean).join(' · ')}
              </div>
              {sky && (
                <div className="popup__meta popup__sky">
                  {sky}
                  {Number.isFinite(obs?.feels) && ` · ${t('popup.feels', { temp: formatTemperature(obs.feels, tUnit, 0) })}`}
                </div>
              )}
            </div>
          </div>
          <button ref={closeRef} type="button" className="btn btn--icon btn--ghost"
            onClick={onClose} aria-label={t('popup.close')}>✕</button>
        </div>

        {error && <p className="error-text" role="alert">⚠ {error}</p>}

        <table className="compare">
          <thead>
            <tr><th scope="col">{t('popup.now')}</th><th scope="col">{t('popup.observed')}</th><th scope="col">{t('popup.simulated')}</th></tr>
          </thead>
          <tbody>
            {rows.map(([quantity, observed, simulated]) => (
              <tr key={quantity}>
                <td>{t(`quantity.${quantity}`)}</td>
                <td>{observed || (loading ? '…' : '—')}</td>
                <td className="sim">{simulated || '—'}</td>
              </tr>
            ))}
            {Number.isFinite(data?.visibility) && (
              <tr><td>{t('quantity.visibility')}</td><td>{formatNumber(data.visibility / 1000, 1)} km</td><td className="sim">—</td></tr>
            )}
          </tbody>
        </table>

        {onInject && (
          <div className="popup__foot" role="group" aria-label={t('popup.injectGroup')}>
            <span>{t('popup.injectHere')}</span>
            <div className="segmented">
              {EVENTS.map(ev => (
                <button key={ev.id} type="button" className="btn btn--sm" title={t(`event.${ev.id}`)}
                  aria-label={t('popup.injectEvent', { event: t(`event.${ev.id}`).toLocaleLowerCase() })}
                  style={{ '--tone': ev.tone }} onClick={() => onInject(ev.id)}>
                  {ev.icon}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="popup__foot">
          <span>{t('popup.sourceObserved')}</span>
          <span style={{ color: 'var(--violet)' }}>{t('popup.sourceSimulated')}</span>
        </div>
      </section>
    </>
  )
}
