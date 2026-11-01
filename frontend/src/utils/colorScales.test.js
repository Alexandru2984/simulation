import assert from 'node:assert/strict'
import test from 'node:test'
import { colorLut, legendGradient, lutIndex, SCALES } from './colorScales.js'

test('extreme values clamp instead of wrapping into garbage colours', () => {
  const lut = colorLut('temp')
  const coldest = lutIndex('temp', -80)
  const hottest = lutIndex('temp', 75)
  assert.equal(coldest, 0)
  assert.equal(hottest, 255)
  // −80 °C must use the darkest cold colour, not a wrapped bright one.
  assert.deepEqual([...lut.slice(0, 3)], SCALES.temp.stops[0][1])
  assert.equal(lutIndex('temp', Number.NaN), 0)
})

test('sparse layers are transparent where nothing happens', () => {
  const precip = colorLut('precip')
  assert.equal(precip[lutIndex('precip', 0) * 4 + 3], 0)
  assert.ok(precip[lutIndex('precip', 10) * 4 + 3] > 100)
  const storm = colorLut('storm')
  assert.equal(storm[lutIndex('storm', 0.1) * 4 + 3], 0)
})

test('legend gradients describe every scale', () => {
  for (const id of Object.keys(SCALES)) {
    assert.match(legendGradient(id), /^linear-gradient\(90deg, rgb\(/)
  }
  assert.equal(legendGradient('unknown'), 'transparent')
})
