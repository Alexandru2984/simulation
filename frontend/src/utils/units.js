// Unit conversion and display formatting. Values arrive in SI-ish units from
// the backend (°C, m/s, hPa); every user-facing string goes through here.

export const TEMPERATURE_UNITS = {
  c: { label: '°C', name: 'Celsius', convert: c => c },
  f: { label: '°F', name: 'Fahrenheit', convert: c => c * 9 / 5 + 32 },
}

export const WIND_UNITS = {
  ms: { label: 'm/s', name: 'Metres per second', convert: v => v },
  kmh: { label: 'km/h', name: 'Kilometres per hour', convert: v => v * 3.6 },
  mph: { label: 'mph', name: 'Miles per hour', convert: v => v * 2.2369363 },
  kn: { label: 'kn', name: 'Knots', convert: v => v * 1.9438445 },
}

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']

const isNumber = value => typeof value === 'number' && Number.isFinite(value)

export function convertTemperature(celsius, unit = 'c') {
  return (TEMPERATURE_UNITS[unit] ?? TEMPERATURE_UNITS.c).convert(celsius)
}

export function formatTemperature(celsius, unit = 'c', digits = 1) {
  if (!isNumber(celsius)) return '—'
  const u = TEMPERATURE_UNITS[unit] ?? TEMPERATURE_UNITS.c
  return `${u.convert(celsius).toFixed(digits)}${u.label}`
}

export function formatWind(metresPerSecond, unit = 'ms', digits = 1) {
  if (!isNumber(metresPerSecond)) return '—'
  const u = WIND_UNITS[unit] ?? WIND_UNITS.ms
  return `${u.convert(metresPerSecond).toFixed(digits)} ${u.label}`
}

export function formatPressure(hPa, digits = 0) {
  return isNumber(hPa) ? `${hPa.toFixed(digits)} hPa` : '—'
}

export function formatPercent(fraction, digits = 0) {
  return isNumber(fraction) ? `${(fraction * 100).toFixed(digits)}%` : '—'
}

export function compassPoint(degrees) {
  if (!isNumber(degrees)) return '—'
  const normalized = ((degrees % 360) + 360) % 360
  return COMPASS[Math.round(normalized / 22.5) % 16]
}

// Meteorological convention: the bearing the wind blows FROM.
export function windFromComponents(u, v) {
  const speed = Math.hypot(u || 0, v || 0)
  const fromDegrees = (Math.atan2(-(u || 0), -(v || 0)) * 180 / Math.PI + 360) % 360
  return { speed, fromDegrees }
}

export function formatLatLon(lat, lon, digits = 1) {
  if (!isNumber(lat) || !isNumber(lon)) return '—'
  const ns = lat >= 0 ? 'N' : 'S'
  const ew = lon >= 0 ? 'E' : 'W'
  return `${Math.abs(lat).toFixed(digits)}°${ns}, ${Math.abs(lon).toFixed(digits)}°${ew}`
}

export function formatRelativeTime(seconds) {
  if (!isNumber(seconds)) return ''
  const s = Math.max(0, Math.round(seconds))
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

export function formatSimTime(seconds) {
  const s = Math.max(0, Math.floor(isNumber(seconds) ? seconds : 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return [h, m, sec].map(n => String(n).padStart(2, '0')).join(':')
}
