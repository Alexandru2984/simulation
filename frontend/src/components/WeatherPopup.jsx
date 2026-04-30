import { useEffect, useState } from 'react'

const COMPASS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW']
const toCompass = d => d != null ? COMPASS[Math.round(d / 22.5) % 16] : '—'

function condIcon(code) {
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

export default function WeatherPopup({ lat, lon, onClose }) {
  const [data, setData]     = useState(null)
  const [error, setError]   = useState(null)
  const [loading, setLoad]  = useState(true)

  useEffect(() => {
    setLoad(true); setData(null); setError(null)
    fetch(`/api/weather/realtime?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return }
        setData(d)
      })
      .catch(() => setError('Network error'))
      .finally(() => setLoad(false))
  }, [lat, lon])

  const card = {
    position: 'fixed',
    top: '50%', left: '50%',
    transform: 'translate(-50%, -50%)',
    zIndex: 50,
    background: 'rgba(10,15,30,0.88)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 20,
    padding: '20px 24px',
    minWidth: 260,
    maxWidth: 340,
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
    color: '#e2e8f0',
  }

  const row = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }
  const label = { color: '#475569', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.07em' }
  const value = { color: '#f1f5f9', fontSize: '0.95rem', fontWeight: 600 }

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 49, background: 'transparent',
      }}/>

      <div style={card}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            {loading && <div style={{ color: '#475569', fontSize: '0.85rem' }}>Loading…</div>}
            {error   && <div style={{ color: '#ef4444', fontSize: '0.85rem' }}>⚠ {error}</div>}
            {data && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '1.8rem' }}>
                    {condIcon(data.weather?.[0]?.id)}
                  </span>
                  <div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{data.name || 'Unknown'}</div>
                    <div style={{ color: '#475569', fontSize: '0.72rem' }}>
                      {data.sys?.country} · {lat.toFixed(2)}°, {lon.toFixed(2)}°
                    </div>
                  </div>
                </div>
                <div style={{ color: '#64748b', fontSize: '0.72rem', marginTop: 4 }}>
                  {data.weather?.[0]?.description}
                </div>
              </>
            )}
          </div>
          <button onClick={onClose} style={{
            background: '#1e293b', border: '1px solid #334155',
            borderRadius: 8, color: '#94a3b8',
            cursor: 'pointer', padding: '4px 8px', fontSize: '0.8rem', lineHeight: 1,
          }}>✕</button>
        </div>

        {data && (
          <>
            <div style={{ borderTop: '1px solid #1e293b', paddingTop: 12 }}>
              {/* Temperature row */}
              <div style={row}>
                <span style={label}>Temperature</span>
                <span style={{ ...value, color: '#f97316' }}>
                  {data.main?.temp?.toFixed(1)}°C
                  <span style={{ color: '#475569', fontSize: '0.72rem', fontWeight: 400, marginLeft: 4 }}>
                    feels {data.main?.feels_like?.toFixed(1)}°
                  </span>
                </span>
              </div>
              <div style={row}>
                <span style={label}>Pressure</span>
                <span style={{ ...value, color: '#60a5fa' }}>{data.main?.pressure} hPa</span>
              </div>
              <div style={row}>
                <span style={label}>Humidity</span>
                <span style={{ ...value, color: '#34d399' }}>{data.main?.humidity}%</span>
              </div>
              <div style={row}>
                <span style={label}>Wind</span>
                <span style={{ ...value, color: '#38bdf8' }}>
                  {data.wind?.speed?.toFixed(1)} m/s &nbsp;
                  <span style={{ fontWeight: 400, fontSize: '0.82rem' }}>
                    {toCompass(data.wind?.deg)} ({data.wind?.deg?.toFixed(0)}°)
                  </span>
                </span>
              </div>
              {data.visibility && (
                <div style={row}>
                  <span style={label}>Visibility</span>
                  <span style={{ ...value, color: '#a78bfa' }}>{(data.visibility / 1000).toFixed(1)} km</span>
                </div>
              )}
            </div>

            <div style={{
              marginTop: 12, paddingTop: 10, borderTop: '1px solid #1e293b',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ color: '#334155', fontSize: '0.68rem' }}>🌐 Observed · OpenWeatherMap</span>
              <span style={{ color: '#22c55e', fontSize: '0.68rem' }}>● Live</span>
            </div>
          </>
        )}
      </div>
    </>
  )
}
