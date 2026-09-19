import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeFrontIntensity, pressureAnomalyLabel } from './weatherFeatures.js'

test('front intensity maps the backend detection range into shader values', () => {
  assert.equal(normalizeFrontIntensity(2.5), 0)
  assert.equal(normalizeFrontIntensity(4.5), 0.5)
  assert.equal(normalizeFrontIntensity(6.5), 1)
  assert.equal(normalizeFrontIntensity(100), 1)
  assert.equal(normalizeFrontIntensity(Number.NaN), 0)
})

test('pressure labels never imply a hurricane wind category', () => {
  assert.equal(pressureAnomalyLabel(-6), 'Pressure low')
  assert.equal(pressureAnomalyLabel(-12), 'Deep low')
  assert.equal(pressureAnomalyLabel(-17), 'Very deep low')
  assert.equal(pressureAnomalyLabel(-25), 'Exceptional low')
  assert.equal(pressureAnomalyLabel(undefined), 'Pressure low')
})
