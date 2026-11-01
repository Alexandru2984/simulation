import test from 'node:test'
import assert from 'node:assert/strict'
import { colorLut } from './colorScales.js'
import { paintOverlay } from './overlayTexture.js'

const ROWS = 36
const COLS = 72

function grid(fill, extra = {}) {
  return { rows: ROWS, cols: COLS, T: new Float32Array(ROWS * COLS).fill(fill), ...extra }
}

test('values below the scale clamp to the coldest colour instead of wrapping', () => {
  const out = new Uint8ClampedArray(360 * 180 * 4)
  assert.equal(paintOverlay(out, 360, 180, grid(-75), 'temp'), true)
  const lut = colorLut('temp')
  assert.deepEqual([...out.slice(0, 4)], [...lut.slice(0, 4)])
  assert.deepEqual([...out.slice(-4)], [...lut.slice(0, 4)])
})

test('a cell centre lands on the texel at its own longitude and latitude', () => {
  const g = grid(0)
  // Row 20 / col 41 is centred at 12.5°N, 27.5°E.
  g.T[20 * COLS + 41] = 50
  const out = new Uint8ClampedArray(360 * 180 * 4)
  paintOverlay(out, 360, 180, g, 'temp')
  // Texel centred on 27.5°E is tx = 207 (−180 + 207.5); 12.5°N is ty = 102.
  const at = (tx, ty) => [...out.slice((ty * 360 + tx) * 4, (ty * 360 + tx) * 4 + 3)]
  const hot = [...colorLut('temp').slice(255 * 4, 255 * 4 + 3)]
  assert.deepEqual(at(207, 102), hot)
  assert.notDeepEqual(at(212, 102), hot)
})

test('missing fields clear the texture', () => {
  const out = new Uint8ClampedArray(8 * 4 * 4).fill(9)
  assert.equal(paintOverlay(out, 8, 4, grid(0), 'storm'), false)
  assert.ok(out.every(v => v === 0))
})

test('longitude wraps across the antimeridian', () => {
  const g = grid(0)
  g.T[10 * COLS + 0] = 50
  g.T[10 * COLS + COLS - 1] = 50
  const out = new Uint8ClampedArray(360 * 180 * 4)
  paintOverlay(out, 360, 180, g, 'temp')
  const hot = [...colorLut('temp').slice(255 * 4, 255 * 4 + 3)]
  // Texel 0 and 359 straddle −180°, halfway between the two hot cells.
  const ty = 52
  assert.deepEqual([...out.slice((ty * 360) * 4, (ty * 360) * 4 + 3)], hot)
  assert.deepEqual([...out.slice((ty * 360 + 359) * 4, (ty * 360 + 359) * 4 + 3)], hot)
})
