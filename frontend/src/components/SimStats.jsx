import { useState, useEffect, useRef } from 'react'
import { useFPS } from '../hooks/useFPS'
import { ArcGauge } from './ArcGauge'

function Sparkline({ history, color, w = 56, h = 20 }) {
  if (!history || history.length < 2) return <div style={{ height: h, width: w }} />
  const min = Math.min(...history), max = Math.max(...history)
  const range = max - min || 1
  const pts = history.map((v, i) => {
    const x = (i / (history.length - 1)) * w
    const y = h - ((v - min) / range) * h
    return `${x},${y}`
  }).join(' ')
  return (
    <svg width={w} height={h} style={{ display: 'block', flexShrink: 0 }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

const LABEL = { color: 'rgba(255,255,255,0.32)', fontSize: '0.58rem', textTransform: 'uppercase', letterSpacing: '0.06em' }

export default function SimStats({ gridData, weatherData, isMobile }) {
  const [history, setHistory] = useState({ T: [], wind: [], storms: [] })
  const tickRef = useRef(-1)
  const fps = useFPS()
  const fpsColor = fps >= 45 ? '#22c55e' : fps >= 30 ? '#eab308' : fps >= 20 ? '#f97316' : '#ef4444'

  useEffect(() => {
    if (!gridData || gridData.tick === tickRef.current) return
    tickRef.current = gridData.tick
    setHistory(prev => ({
      T:      [...prev.T.slice(-60),      gridData.avgT ?? 0],
      wind:   [...prev.wind.slice(-60),   gridData.avgWind ?? 0],
      storms: [...prev.storms.slice(-60), gridData.storms?.length ?? 0],
    }))
  }, [gridData])

  if (isMobile || !gridData) return null

  const avgT    = gridData.avgT?.toFixed(1)    ?? '—'
  const avgWind = gridData.avgWind?.toFixed(1) ?? '—'
  const nStorms = gridData.storms?.length ?? 0

  return (
    <div style={{
      position: 'absolute', bottom: 24, left: 20, zIndex: 20,
      background: 'rgba(10,15,30,0.82)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 16,
      padding: '12px 14px',
      width: 224,
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    }}>
      {/* Section header */}
      <div style={{ color: 'rgba(255,255,255,0.28)', fontSize: '0.6rem', textTransform: 'uppercase',
        letterSpacing: '0.1em', paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.06)',
        marginBottom: 10 }}>
        📊 Sim Stats
      </div>

      {/* Arc gauges row */}
      {weatherData && (
        <div style={{ display: 'flex', gap: 0, marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <ArcGauge value={weatherData.temperature} min={-20} max={50}   label="Temp"  unit="°C"  color="#f97316" size="sm" />
          <ArcGauge value={weatherData.pressure}    min={980}  max={1040} label="Press" unit="hPa" color="#60a5fa" size="sm" />
          <ArcGauge value={weatherData.wind_speed}  min={0}    max={30}   label="Wind"  unit="m/s" color="#34d399" size="sm" />
        </div>
      )}

      {/* Sparkline rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div>
            <div style={LABEL}>Avg Temp</div>
            <div style={{ color: '#f97316', fontWeight: 700, fontSize: '0.85rem', lineHeight: 1.3 }}>{avgT}°C</div>
          </div>
          <Sparkline history={history.T} color="#f97316" />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div>
            <div style={LABEL}>Avg Wind</div>
            <div style={{ color: '#38bdf8', fontWeight: 700, fontSize: '0.85rem', lineHeight: 1.3 }}>{avgWind} m/s</div>
          </div>
          <Sparkline history={history.wind} color="#38bdf8" />
        </div>

        {/* Storms + FPS */}
        <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
          <div style={{
            flex: 1, padding: '4px 8px',
            background: nStorms > 0 ? 'rgba(168,85,247,0.1)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${nStorms > 0 ? 'rgba(168,85,247,0.35)' : 'rgba(255,255,255,0.06)'}`,
            borderRadius: 8,
          }}>
            <div style={LABEL}>Storms</div>
            <div style={{ color: nStorms > 0 ? '#a855f7' : 'rgba(255,255,255,0.22)', fontWeight: 700, fontSize: '0.82rem' }}>
              {nStorms > 0 ? `🌀 ${nStorms}` : '—'}
            </div>
          </div>
          <div style={{
            flex: 1, padding: '4px 8px',
            background: 'rgba(255,255,255,0.03)',
            border: `1px solid ${fpsColor}22`,
            borderRadius: 8,
          }}>
            <div style={LABEL}>FPS</div>
            <div style={{ color: fpsColor, fontWeight: 700, fontSize: '0.82rem' }}>{fps}</div>
          </div>
        </div>
      </div>

      <div style={{ color: 'rgba(255,255,255,0.1)', fontSize: '0.57rem', textAlign: 'right', marginTop: 6 }}>
        tick #{gridData.tick}
      </div>
    </div>
  )
}
