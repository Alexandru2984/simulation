import { useEffect, useId, useRef, useState } from 'react'
import { EVENTS } from '../constants'
import { apiErrorMessage } from '../utils/api'
import { sampleGrid } from '../utils/geoUtils'
import {
  compassPoint, formatLatLon, formatPercent, formatPressure, formatTemperature,
  formatWind, windFromComponents,
} from '../utils/units'

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
        if (err.name !== 'AbortError') setError(err.message || 'Network error')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [lat, lon])

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

  const t = prefs.tempUnit
  const w = prefs.windUnit
  const rows = [
    ['Temperature', obs && formatTemperature(obs.temp, t), sim && formatTemperature(sim.temp, t)],
    ['Pressure', obs && formatPressure(obs.pressure), sim && formatPressure(sim.pressure)],
    ['Humidity', obs && formatPercent(obs.humidity), sim && formatPercent(sim.humidity)],
    ['Wind', obs && `${formatWind(obs.windSpeed, w)} ${compassPoint(obs.windFrom)}`,
      sim && `${formatWind(sim.windSpeed, w)} ${compassPoint(sim.windFrom)}`],
  ]

  const title = data?.name || (loading ? 'Loading…' : 'Open ocean')

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
              {data?.weather?.[0]?.description && (
                <div className="popup__meta" style={{ textTransform: 'capitalize' }}>
                  {data.weather[0].description}
                  {Number.isFinite(obs?.feels) && ` · feels ${formatTemperature(obs.feels, t, 0)}`}
                </div>
              )}
            </div>
          </div>
          <button ref={closeRef} type="button" className="btn btn--icon btn--ghost"
            onClick={onClose} aria-label="Close weather details">✕</button>
        </div>

        {error && <p className="error-text" role="alert">⚠ {error}</p>}

        <table className="compare">
          <thead>
            <tr><th scope="col">Now</th><th scope="col">Observed</th><th scope="col">Simulated</th></tr>
          </thead>
          <tbody>
            {rows.map(([label, observed, simulated]) => (
              <tr key={label}>
                <td>{label}</td>
                <td>{observed || (loading ? '…' : '—')}</td>
                <td className="sim">{simulated || '—'}</td>
              </tr>
            ))}
            {Number.isFinite(data?.visibility) && (
              <tr><td>Visibility</td><td>{(data.visibility / 1000).toFixed(1)} km</td><td className="sim">—</td></tr>
            )}
          </tbody>
        </table>

        {onInject && (
          <div className="popup__foot" role="group" aria-label="Inject an event at this location">
            <span>Inject here</span>
            <div className="segmented">
              {EVENTS.map(ev => (
                <button key={ev.id} type="button" className="btn btn--sm" title={ev.label}
                  aria-label={`Inject ${ev.label.toLowerCase()} here`}
                  style={{ '--tone': ev.tone }} onClick={() => onInject(ev.id)}>
                  {ev.icon}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="popup__foot">
          <span>Observed · OpenWeatherMap</span>
          <span style={{ color: 'var(--violet)' }}>Simulated · this model</span>
        </div>
      </section>
    </>
  )
}
