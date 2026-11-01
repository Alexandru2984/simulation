import assert from 'node:assert/strict'
import test from 'node:test'
import {
  compassPoint, formatLatLon, formatRelativeTime, formatSimTime,
  formatTemperature, formatWind, windFromComponents,
} from './units.js'

test('temperature and wind honour the selected unit', () => {
  assert.equal(formatTemperature(20, 'c'), '20.0°C')
  assert.equal(formatTemperature(20, 'f'), '68.0°F')
  assert.equal(formatTemperature(-40, 'f', 0), '-40°F')
  assert.equal(formatTemperature(undefined), '—')
  assert.equal(formatWind(10, 'kmh', 0), '36 km/h')
  assert.equal(formatWind(10, 'kn'), '19.4 kn')
  assert.equal(formatWind(Number.NaN), '—')
})

test('wind direction uses the meteorological "from" bearing', () => {
  // Blowing toward the south (V < 0) is a northerly wind.
  assert.equal(compassPoint(windFromComponents(0, -5).fromDegrees), 'N')
  // Blowing toward the east (U > 0) is a westerly wind.
  assert.equal(compassPoint(windFromComponents(5, 0).fromDegrees), 'W')
  assert.equal(windFromComponents(3, 4).speed, 5)
  assert.equal(compassPoint(-90), 'W')
  assert.equal(compassPoint(359), 'N')
})

test('coordinates, relative times and sim clock format consistently', () => {
  assert.equal(formatLatLon(44.43, -26.1), '44.4°N, 26.1°W')
  assert.equal(formatRelativeTime(2), 'just now')
  assert.equal(formatRelativeTime(42), '42s ago')
  assert.equal(formatRelativeTime(185), '3m ago')
  assert.equal(formatRelativeTime(7300), '2h ago')
  assert.equal(formatSimTime(3725.9), '01:02:05')
})
