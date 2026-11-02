// Unit conversion and display formatting. Values arrive in SI-ish units from
// the backend (°C, m/s, hPa); every user-facing string goes through here.
// Numbers, compass points and relative times follow the interface language
// (decimal comma and "V" for west in Romanian).
import { getLanguage, t } from '../i18n/i18n.js'

// Unit names for people are in the dictionaries: t(`unit.${id}`).
export const TEMPERATURE_UNITS = {
  c: { label: '°C', convert: c => c },
  f: { label: '°F', convert: c => c * 9 / 5 + 32 },
}

export const WIND_UNITS = {
  ms: { label: 'm/s', convert: v => v },
  kmh: { label: 'km/h', convert: v => v * 3.6 },
  mph: { label: 'mph', convert: v => v * 2.2369363 },
  kn: { label: 'kn', convert: v => v * 1.9438445 },
}

const isNumber = value => typeof value === 'number' && Number.isFinite(value)

const numberFormats = new Map()

// Fixed decimals in the interface language, without thousands separators
// (1013 hPa, not 1,013 hPa).
export function formatNumber(value, digits = 0) {
  if (!isNumber(value)) return '—'
  const key = `${getLanguage()}:${digits}`
  if (!numberFormats.has(key)) {
    numberFormats.set(key, new Intl.NumberFormat(getLanguage(), {
      minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false,
    }))
  }
  // Intl rounds -0.04 to "-0.0"; show it as 0.
  const text = numberFormats.get(key).format(value)
  return /^-0([.,]0+)?$/.test(text) ? text.slice(1) : text
}

const compassPoints = () => t('compass.points').split(' ')

export function convertTemperature(celsius, unit = 'c') {
  return (TEMPERATURE_UNITS[unit] ?? TEMPERATURE_UNITS.c).convert(celsius)
}

export function formatTemperature(celsius, unit = 'c', digits = 1) {
  if (!isNumber(celsius)) return '—'
  const u = TEMPERATURE_UNITS[unit] ?? TEMPERATURE_UNITS.c
  return `${formatNumber(u.convert(celsius), digits)}${u.label}`
}

export function formatWind(metresPerSecond, unit = 'ms', digits = 1) {
  if (!isNumber(metresPerSecond)) return '—'
  const u = WIND_UNITS[unit] ?? WIND_UNITS.ms
  return `${formatNumber(u.convert(metresPerSecond), digits)} ${u.label}`
}

export function formatPressure(hPa, digits = 0) {
  return isNumber(hPa) ? `${formatNumber(hPa, digits)} hPa` : '—'
}

export function formatPercent(fraction, digits = 0) {
  return isNumber(fraction) ? `${formatNumber(fraction * 100, digits)}%` : '—'
}

export function compassPoint(degrees) {
  if (!isNumber(degrees)) return '—'
  const normalized = ((degrees % 360) + 360) % 360
  return compassPoints()[Math.round(normalized / 22.5) % 16]
}

// Meteorological convention: the bearing the wind blows FROM.
export function windFromComponents(u, v) {
  const speed = Math.hypot(u || 0, v || 0)
  const fromDegrees = (Math.atan2(-(u || 0), -(v || 0)) * 180 / Math.PI + 360) % 360
  return { speed, fromDegrees }
}

export function formatLatLon(lat, lon, digits = 1) {
  if (!isNumber(lat) || !isNumber(lon)) return '—'
  const points = compassPoints()
  const ns = lat >= 0 ? points[0] : points[8]
  const ew = lon >= 0 ? points[4] : points[12]
  return `${formatNumber(Math.abs(lat), digits)}°${ns}, ${formatNumber(Math.abs(lon), digits)}°${ew}`
}

export function formatRelativeTime(seconds) {
  if (!isNumber(seconds)) return ''
  const s = Math.max(0, Math.round(seconds))
  if (s < 5) return t('time.justNow')
  if (s < 60) return t('time.secondsAgo', { n: s })
  if (s < 3600) return t('time.minutesAgo', { n: Math.floor(s / 60) })
  return t('time.hoursAgo', { n: Math.floor(s / 3600) })
}

export function formatSimTime(seconds) {
  const s = Math.max(0, Math.floor(isNumber(seconds) ? seconds : 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return [h, m, sec].map(n => String(n).padStart(2, '0')).join(':')
}
