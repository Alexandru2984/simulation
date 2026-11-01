import { useEffect, useRef, useState } from 'react'
import { useFPS } from '../hooks/useFPS'
import { ArcGauge } from './ArcGauge'
import EventFeed from './EventFeed'
import { convertTemperature, formatTemperature, formatWind, TEMPERATURE_UNITS, WIND_UNITS } from '../utils/units'

function Sparkline({ history, color, w = 64, h = 22 }) {
  if (!history || history.length < 2) return <div style={{ height: h, width: w }} aria-hidden="true" />
  const min = Math.min(...history)
  const max = Math.max(...history)
  const range = max - min || 1
  const pts = history.map((v, i) => {
    const x = (i / (history.length - 1)) * w
    const y = h - ((v - min) / range) * (h - 2) - 1
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return (
    <svg width={w} height={h} style={{ display: 'block', flexShrink: 0 }} aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// Rolling history of the global means, one sample per received grid tick.
function useGridHistory(gridData, length = 60) {
  const [history, setHistory] = useState({ T: [], wind: [] })
  const tickRef = useRef(-1)
  useEffect(() => {
    if (!gridData || gridData.tick === tickRef.current) return
    tickRef.current = gridData.tick
    setHistory(prev => ({
      T: [...prev.T.slice(-(length - 1)), gridData.avgT ?? 0],
      wind: [...prev.wind.slice(-(length - 1)), gridData.avgWind ?? 0],
    }))
  }, [gridData, length])
  return history
}

export default function SimStats({ gridData, weatherData, prefs, onFocus }) {
  const history = useGridHistory(gridData)
  const fps = useFPS()
  if (!gridData) return null

  const fpsColor = fps >= 45 ? '#22c55e' : fps >= 30 ? '#eab308' : fps >= 20 ? '#f97316' : '#ef4444'
  const nStorms = gridData.storms?.length ?? 0
  const tUnit = TEMPERATURE_UNITS[prefs.tempUnit] ?? TEMPERATURE_UNITS.c
  const wUnit = WIND_UNITS[prefs.windUnit] ?? WIND_UNITS.ms

  return (
    <section className="dock-bottom-left glass panel" aria-label="Simulation statistics">
      <h2 className="eyebrow">📊 Sim stats</h2>

      {weatherData && (
        <div className="gauges">
          <ArcGauge value={convertTemperature(weatherData.temperature, prefs.tempUnit)}
            min={convertTemperature(-20, prefs.tempUnit)} max={convertTemperature(50, prefs.tempUnit)}
            label="Temp" unit={tUnit.label} color="#f97316" size="sm" />
          <ArcGauge value={weatherData.pressure} min={980} max={1040} label="Press" unit="hPa" color="#60a5fa" size="sm" />
          <ArcGauge value={wUnit.convert(weatherData.wind_speed)} min={0} max={wUnit.convert(30)}
            label="Wind" unit={wUnit.label} color="#34d399" size="sm" />
        </div>
      )}

      <div className="stack">
        <div className="stat-row">
          <div>
            <div className="stat-label">Global mean temp</div>
            <div className="stat-value" style={{ color: '#f97316' }}>{formatTemperature(gridData.avgT, prefs.tempUnit)}</div>
          </div>
          <Sparkline history={history.T} color="#f97316" />
        </div>
        <div className="stat-row">
          <div>
            <div className="stat-label">Global mean wind</div>
            <div className="stat-value" style={{ color: '#38bdf8' }}>{formatWind(gridData.avgWind, prefs.windUnit)}</div>
          </div>
          <Sparkline history={history.wind} color="#38bdf8" />
        </div>

        <div className="stat-tiles">
          <div className="stat-tile">
            <div className="stat-label">Storms</div>
            <div className="stat-value" style={{ color: nStorms ? '#a855f7' : 'var(--text-faint)' }}>{nStorms || '—'}</div>
          </div>
          <div className="stat-tile">
            <div className="stat-label">Online</div>
            <div className="stat-value" style={{ color: '#34d399' }}>{gridData.viewers ?? '—'}</div>
          </div>
          <div className="stat-tile">
            <div className="stat-label">FPS</div>
            <div className="stat-value" style={{ color: fpsColor }}>{fps}</div>
          </div>
        </div>

        <div>
          <h3 className="eyebrow" style={{ margin: '6px 0 4px' }}>Recent events</h3>
          <EventFeed events={gridData.events} serverTime={gridData.serverTime} onFocus={onFocus} limit={3} />
        </div>
        <div className="muted" style={{ textAlign: 'right' }}>tick #{gridData.tick?.toLocaleString?.() ?? gridData.tick}</div>
      </div>
    </section>
  )
}
