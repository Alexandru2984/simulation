import { useState, useEffect, useCallback } from 'react'

const DIRECTIONS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW']
function degToCompass(d) {
  return DIRECTIONS[Math.round(d / 22.5) % 16]
}

function Gauge({ value, min, max, label, unit, color }) {
  const pct = Math.max(0, Math.min(1, (value - min) / (max - min)))
  const angle = -140 + pct * 280
  return (
    <div style={{ textAlign: 'center', flex: 1 }}>
      <svg width="90" height="60" viewBox="0 0 90 60">
        <path d="M 10 55 A 35 35 0 0 1 80 55" fill="none" stroke="#1e293b" strokeWidth="6" strokeLinecap="round"/>
        <path d="M 10 55 A 35 35 0 0 1 80 55" fill="none" stroke={color} strokeWidth="6"
          strokeLinecap="round" strokeDasharray="110" strokeDashoffset={110 - pct * 110}/>
        <line
          x1="45" y1="55"
          x2={45 + 28 * Math.cos((angle - 90) * Math.PI / 180)}
          y2={55 + 28 * Math.sin((angle - 90) * Math.PI / 180)}
          stroke={color} strokeWidth="2" strokeLinecap="round"
        />
        <circle cx="45" cy="55" r="3" fill={color}/>
      </svg>
      <div style={{ color, fontSize: '1.3rem', fontWeight: 700, marginTop: '-6px' }}>
        {value !== null ? Number(value).toFixed(1) : '—'}
        <span style={{ fontSize: '0.7rem', color: '#64748b', marginLeft: 3 }}>{unit}</span>
      </div>
      <div style={{ color: '#475569', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
    </div>
  )
}

export default function WeatherHUD({ weatherData, status, onSeed, onSpeedChange, locations }) {
  const [speed, setSpeed] = useState(1)
  const [seeding, setSeeding] = useState(false)
  const [lastCity, setLastCity] = useState(null)
  const [clickHint, setClickHint] = useState(true)

  useEffect(() => { if (weatherData) setClickHint(false) }, [weatherData])

  const handleSeed = useCallback(async (lat, lon, name) => {
    setSeeding(true)
    setLastCity(name || `${lat.toFixed(1)}°, ${lon.toFixed(1)}°`)
    await onSeed(lat, lon)
    setSeeding(false)
  }, [onSeed])

  const handleSpeed = (v) => {
    setSpeed(v)
    onSpeedChange(v)
  }

  const wd = weatherData
  const isRain = wd && wd.pressure < 1010
  const statusColors = { connected: '#22c55e', reconnecting: '#f59e0b', connecting: '#60a5fa' }
  const sc = statusColors[status] || '#64748b'

  return (
    <>
      {/* Top-left: title + status */}
      <div style={{ position: 'absolute', top: 20, left: 24, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '1.5rem' }}>🌦️</span>
          <div>
            <div style={{ color: '#f1f5f9', fontWeight: 700, fontSize: '1.05rem', letterSpacing: '-0.01em' }}>
              Weather Simulation
            </div>
            <div style={{ color: '#475569', fontSize: '0.7rem' }}>simulation.micutu.com</div>
          </div>
          <span style={{
            marginLeft: 8, padding: '2px 10px', borderRadius: 999,
            border: `1px solid ${sc}`, color: sc,
            fontSize: '0.7rem', background: '#0f172acc'
          }}>
            ● {status}
          </span>
          {isRain && (
            <span style={{ padding: '2px 10px', borderRadius: 999, border: '1px solid #60a5fa',
              color: '#60a5fa', fontSize: '0.7rem', background: '#0f172acc' }}>
              🌧 Rain
            </span>
          )}
        </div>
      </div>

      {/* Top-right: gauges */}
      <div style={{
        position: 'absolute', top: 16, right: 20, zIndex: 10,
        background: '#0f172aee', border: '1px solid #1e293b',
        borderRadius: 16, padding: '14px 18px', backdropFilter: 'blur(8px)',
        display: 'flex', gap: 8, minWidth: 280,
      }}>
        <Gauge value={wd?.temperature}    min={-20} max={50}   label="Temp"     unit="°C"  color="#f97316" />
        <Gauge value={wd?.pressure}       min={980}  max={1040} label="Pressure" unit=" hPa" color="#60a5fa" />
        <Gauge value={wd?.wind_speed}     min={0}   max={30}   label="Wind"     unit=" m/s" color="#34d399" />
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ color: '#38bdf8', fontSize: '2rem', marginTop: 8 }}>
            {wd ? degToCompass(wd.wind_direction) : '—'}
          </div>
          <div style={{ color: '#38bdf8', fontSize: '0.9rem', fontWeight: 600 }}>
            {wd ? `${Number(wd.wind_direction).toFixed(0)}°` : ''}
          </div>
          <div style={{ color: '#475569', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Dir</div>
        </div>
      </div>

      {/* Bottom: city presets + speed */}
      <div style={{
        position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
        zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
      }}>
        {/* City buttons */}
        <div style={{
          background: '#0f172aee', border: '1px solid #1e293b', borderRadius: 14,
          padding: '10px 16px', backdropFilter: 'blur(8px)',
          display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 700,
        }}>
          {(locations || []).map(loc => (
            <button key={loc.name}
              onClick={() => handleSeed(loc.lat, loc.lon, loc.name)}
              disabled={seeding}
              style={{
                background: lastCity === loc.name ? '#1d4ed8' : '#1e293b',
                color: lastCity === loc.name ? '#fff' : '#94a3b8',
                border: `1px solid ${lastCity === loc.name ? '#3b82f6' : '#334155'}`,
                borderRadius: 8, padding: '4px 12px', fontSize: '0.75rem',
                cursor: seeding ? 'wait' : 'pointer', transition: 'all 0.2s',
              }}
            >
              {loc.flag || ''} {loc.name}
            </button>
          ))}
        </div>

        {/* Speed control */}
        <div style={{
          background: '#0f172aee', border: '1px solid #1e293b', borderRadius: 12,
          padding: '8px 18px', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ color: '#475569', fontSize: '0.75rem' }}>⏩ Speed</span>
          {[1, 2, 5, 10, 20].map(v => (
            <button key={v}
              onClick={() => handleSpeed(v)}
              style={{
                background: speed === v ? '#7c3aed' : '#1e293b',
                color: speed === v ? '#fff' : '#64748b',
                border: `1px solid ${speed === v ? '#8b5cf6' : '#334155'}`,
                borderRadius: 6, padding: '3px 10px', fontSize: '0.75rem', cursor: 'pointer',
              }}>
              {v}x
            </button>
          ))}
          {lastCity && (
            <span style={{ color: '#475569', fontSize: '0.7rem', marginLeft: 4 }}>
              📍 {seeding ? 'Seeding…' : lastCity}
            </span>
          )}
        </div>
      </div>

      {/* Globe click hint */}
      {clickHint && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)', zIndex: 5,
          color: '#475569', fontSize: '0.8rem', textAlign: 'center',
          pointerEvents: 'none',
        }}>
          <div style={{ fontSize: '2rem' }}>🌍</div>
          <div>Click on the globe to seed from a real location</div>
          <div>or choose a city below</div>
        </div>
      )}
    </>
  )
}
