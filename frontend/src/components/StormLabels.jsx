import GlobeLabel from './GlobeLabel'
import { pressureAnomalyLabel } from '../utils/weatherFeatures'
import { formatWind } from '../utils/units'

export default function StormLabels({ registry, storms = [], windUnit = 'ms' }) {
  if (!storms?.length) return null
  // Deepest lows first; only label the eight most significant.
  const top = [...storms].sort((a, b) => (a.anom ?? 0) - (b.anom ?? 0)).slice(0, 8)
  return top.map(storm => {
    const id = `storm:${storm.lat.toFixed(1)}_${storm.lon.toFixed(1)}`
    return (
      <GlobeLabel key={id} id={id} registry={registry} lat={storm.lat} lon={storm.lon} className="storm-label">
        <span aria-hidden="true">🌀</span>
        <span>
          <strong>{pressureAnomalyLabel(storm.anom)}</strong>
          <small>{Number.isFinite(storm.P) ? `${storm.P.toFixed(0)} hPa` : '—'} · {formatWind(storm.wind, windUnit, 0)}</small>
        </span>
      </GlobeLabel>
    )
  })
}
