// Paints a grid field into an equirectangular RGBA texture.
//
// Texel (tx, ty) covers longitude −180 + (tx + ½)·360/width and latitude
// −90 + (ty + ½)·180/height (DataTexture row 0 is the south pole). Grid cell
// (r, c) is centred on −90 + (r + ½)·180/rows, −180 + (c + ½)·360/cols, so
// the bilinear sample uses fractional indices offset by half a cell. The old
// overlay mapped texel 0 to cell 0's centre, shifting every value 2.5°.

import { colorLut, SCALES } from './colorScales.js'

export const OVERLAY_FIELDS = { temp: 'T', pressure: 'P', humidity: 'H', precip: 'R', storm: 'SP' }

const axisCache = new Map()

function columnAxis(width, cols) {
  const key = `${width}:${cols}`
  let axis = axisCache.get(key)
  if (!axis) {
    const c0 = new Int32Array(width)
    const c1 = new Int32Array(width)
    const f = new Float32Array(width)
    for (let tx = 0; tx < width; tx++) {
      const g = ((tx + 0.5) / width) * cols - 0.5
      const floor = Math.floor(g)
      c0[tx] = ((floor % cols) + cols) % cols
      c1[tx] = (c0[tx] + 1) % cols
      f[tx] = g - floor
    }
    axis = { c0, c1, f }
    axisCache.set(key, axis)
  }
  return axis
}

// Returns false (and clears `out`) when the grid lacks the requested field.
export function paintOverlay(out, width, height, grid, mode) {
  const field = OVERLAY_FIELDS[mode]
  const values = field ? grid?.[field] : null
  const rows = grid?.rows
  const cols = grid?.cols
  if (!values || !rows || !cols || values.length < rows * cols) {
    out.fill(0)
    return false
  }

  const lut = colorLut(mode)
  const { min, max } = SCALES[mode]
  const k = 255 / (max - min)
  const { c0, c1, f: fc } = columnAxis(width, cols)

  for (let ty = 0; ty < height; ty++) {
    const g = Math.min(rows - 1, Math.max(0, ((ty + 0.5) / height) * rows - 0.5))
    const r0 = Math.floor(g)
    const r1 = Math.min(r0 + 1, rows - 1)
    const fr = g - r0
    const row0 = r0 * cols
    const row1 = r1 * cols
    let o = ty * width * 4

    for (let tx = 0; tx < width; tx++, o += 4) {
      const a = c0[tx]
      const b = c1[tx]
      const t = fc[tx]
      const top = values[row0 + a] * (1 - t) + values[row0 + b] * t
      const bottom = values[row1 + a] * (1 - t) + values[row1 + b] * t
      const value = top * (1 - fr) + bottom * fr
      if (!Number.isFinite(value)) {
        out[o + 3] = 0
        continue
      }
      let idx = Math.round((value - min) * k)
      idx = idx < 0 ? 0 : idx > 255 ? 255 : idx
      const l = idx * 4
      out[o] = lut[l]
      out[o + 1] = lut[l + 1]
      out[o + 2] = lut[l + 2]
      out[o + 3] = lut[l + 3]
    }
  }
  return true
}
