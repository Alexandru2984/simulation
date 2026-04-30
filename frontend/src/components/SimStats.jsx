import { useState, useEffect, useRef } from 'react'
import { useFPS } from '../hooks/useFPS'

function sparkline(history, color, w = 60, h = 24) {
  if (!history || history.length < 2) return null
  const min = Math.min(...history), max = Math.max(...history)
  const range = max - min || 1
  const pts = history.map((v, i) => {
    const x = (i / (history.length - 1)) * w
    const y = h - ((v - min) / range) * h
    return `${x},${y}`
  }).join(' ')
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export default function SimStats({ gridData, isMobile }) {
  const [history, setHistory] = useState({ T: [], wind: [], storms: [] })
  const tickRef = useRef(-1)
  const fps = useFPS()
  const fpsColor = fps >= 45 ? '#22c55e' : fps >= 30 ? '#eab308' : fps >= 20 ? '#f97316' : '#ef4444'

  useEffect(() => {
    if (!gridData || gridData.tick === tickRef.current) return
    tickRef.current = gridData.tick
    setHistory(prev => ({
      T:      [...prev.T.slice(-60),     gridData.avgT ?? 0],
      wind:   [...prev.wind.slice(-60),   gridData.avgWind ?? 0],
      storms: [...prev.storms.slice(-60), (gridData.storms?.length ?? 0)],
    }))
  }, [gridData])

  if (!gridData) return null

  const avgT    = gridData.avgT?.toFixed(1) ?? '—'
  const avgWind = gridData.avgWind?.toFixed(1) ?? '—'
  const nStorms = gridData.storms?.length ?? 0

  const stat = {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
    padding: '6px 10px', background: '#0f172a88', borderRadius: 10,
    border: '1px solid #1e293b', minWidth: 80,
  }
  const label = { color: '#475569', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.06em' }
  const val   = { fontSize: '0.95rem', fontWeight: 700, lineHeight: 1.2 }

  if (isMobile) return (
    <div style={{ display: 'flex', gap: 6, padding: '0 12px 4px', overflowX: 'auto', scrollbarWidth: 'none' }}>
      <div style={stat}>
        <span style={label}>Avg T</span>
        <span style={{ ...val, color: '#f97316' }}>{avgT}°C</span>
      </div>
      <div style={stat}>
        <span style={label}>Avg Wind</span>
        <span style={{ ...val, color: '#38bdf8' }}>{avgWind} m/s</span>
      </div>
      <div style={stat}>
        <span style={label}>Storms</span>
        <span style={{ ...val, color: nStorms > 0 ? '#a855f7' : '#475569' }}>
          {nStorms > 0 ? `🌀 ${nStorms}` : '—'}
        </span>
      </div>
      <div style={stat}>
        <span style={label}>Tick</span>
        <span style={{ ...val, color: '#64748b' }}>#{gridData.tick}</span>
      </div>
      <div style={stat}>
        <span style={label}>FPS</span>
        <span style={{ ...val, color: fpsColor }}>{fps}</span>
      </div>
    </div>
  )

  return (
    <div style={{
      position: 'absolute', bottom: 24, left: 20, zIndex: 20,
      background: '#0f172aee', border: '1px solid #1e293b', borderRadius: 16,
      padding: '12px 14px', backdropFilter: 'blur(10px)',
      boxShadow: '0 4px 24px #00000066',
      display: 'flex', flexDirection: 'column', gap: 10,
      minWidth: 150,
    }}>
      <div style={{ color: '#475569', fontSize: '0.65rem', textTransform: 'uppercase',
        letterSpacing: '0.1em', paddingBottom: 4, borderBottom: '1px solid #1e293b' }}>
        📊 Simulation Stats
      </div>

      {/* Avg Temperature */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
          <span style={label}>Global Avg Temp</span>
          <span style={{ color: '#f97316', fontWeight: 700, fontSize: '0.9rem' }}>{avgT}°C</span>
        </div>
        {sparkline(history.T, '#f97316')}
      </div>

      {/* Avg Wind */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
          <span style={label}>Avg Wind Speed</span>
          <span style={{ color: '#38bdf8', fontWeight: 700, fontSize: '0.9rem' }}>{avgWind} m/s</span>
        </div>
        {sparkline(history.wind, '#38bdf8')}
      </div>

      {/* Active storms */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '6px 8px', background: nStorms > 0 ? '#a855f711' : '#1e293b33',
        border: `1px solid ${nStorms > 0 ? '#a855f744' : '#1e293b'}`, borderRadius: 8,
      }}>
        <span style={label}>Active Storms</span>
        <span style={{ color: nStorms > 0 ? '#a855f7' : '#475569', fontWeight: 700, fontSize: '1rem' }}>
          {nStorms > 0 ? `🌀 ${nStorms}` : '—'}
        </span>
      </div>

      {/* FPS */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '6px 8px', background: '#1e293b33',
        border: `1px solid ${fpsColor}33`, borderRadius: 8,
      }}>
        <span style={label}>Render FPS</span>
        <span style={{ color: fpsColor, fontWeight: 700, fontSize: '0.9rem' }}>
          {fps} fps
        </span>
      </div>

      <div style={{ color: '#1e293b', fontSize: '0.6rem', textAlign: 'right' }}>
        tick #{gridData.tick}
      </div>
    </div>
  )
}
