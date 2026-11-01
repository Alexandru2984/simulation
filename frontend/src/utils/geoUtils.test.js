import test from 'node:test'
import assert from 'node:assert/strict'
import { facesCamera, latLonToVec3, normalizeLon, sampleGrid, sunDirection, vec3ToLatLon } from './geoUtils.js'

test('normalizeLon wraps into [-180, 180)', () => {
  assert.equal(normalizeLon(0), 0)
  assert.equal(normalizeLon(180), -180)
  assert.equal(normalizeLon(-300), 60)
  assert.equal(normalizeLon(540), -180)
  assert.equal(normalizeLon(-180), -180)
})

test('vec3ToLatLon inverts latLonToVec3 with longitudes in range', () => {
  for (const [lat, lon] of [[44.4, 26.1], [-33.9, 151.2], [64.1, -21.9], [0, 179.5], [0, -179.5]]) {
    const v = latLonToVec3(lat, lon)
    const back = vec3ToLatLon(v.x, v.y, v.z)
    assert.ok(Math.abs(back.lat - lat) < 1e-9)
    assert.ok(Math.abs(back.lon - lon) < 1e-9, `${lon} → ${back.lon}`)
    assert.ok(back.lon >= -180 && back.lon < 180)
  }
})

test('facesCamera hides the far hemisphere', () => {
  const camera = latLonToVec3(0, 0, 6)
  assert.equal(facesCamera(latLonToVec3(10, 10), camera), true)
  assert.equal(facesCamera(latLonToVec3(0, 180), camera), false)
})

test('sampleGrid reads exact cell centres', () => {
  const arr = new Float32Array(36 * 72)
  arr[20 * 72 + 41] = 7
  // Row 20 → lat −87.5 + 100 = 12.5, col 41 → lon −177.5 + 205 = 27.5
  assert.ok(Math.abs(sampleGrid(12.5, 27.5, arr) - 7) < 1e-9)
})

test('sunDirection puts the sub-solar point at the right longitude', () => {
  const near = (a, b) => Math.abs(a - b) < 0.02
  // March equinox, 12:00 UTC → over Greenwich, on the equator.
  let s = sunDirection(new Date(Date.UTC(2026, 2, 20, 12, 0, 0)))
  let p = vec3ToLatLon(s.x, s.y, s.z, 1)
  assert.ok(Math.abs(p.lat) < 1.5 && Math.abs(p.lon) < 1, JSON.stringify(p))
  // 18:00 UTC → over 90°W (the Americas), not 90°E.
  s = sunDirection(new Date(Date.UTC(2026, 2, 20, 18, 0, 0)))
  p = vec3ToLatLon(s.x, s.y, s.z, 1)
  assert.ok(near(p.lon / 100, -0.9), JSON.stringify(p))
  // June solstice → ~23.4°N.
  s = sunDirection(new Date(Date.UTC(2026, 5, 21, 12, 0, 0)))
  p = vec3ToLatLon(s.x, s.y, s.z, 1)
  assert.ok(p.lat > 22.5 && p.lat < 23.6, JSON.stringify(p))
})
