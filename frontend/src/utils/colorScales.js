// Colour scales shared by the globe overlay and its legend, so what the
// legend shows is exactly what the shader texture uses.
//
// Each scale maps a value range onto a 256-entry RGBA lookup table. Values
// outside the range clamp to the end colours (the old per-pixel maths
// extrapolated, and Uint8Array wrapped negative channels into garbage
// colours below −40 °C).

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

function interpolate(stops, value) {
  if (value <= stops[0][0]) return stops[0][1]
  for (let i = 1; i < stops.length; i++) {
    const [v1, c1] = stops[i]
    if (value <= v1) {
      const [v0, c0] = stops[i - 1]
      const f = (value - v0) / (v1 - v0)
      return [0, 1, 2].map(k => Math.round(c0[k] + f * (c1[k] - c0[k])))
    }
  }
  return stops[stops.length - 1][1]
}

// Titles for people are in the dictionaries: t(`scale.${id}`).
export const SCALES = {
  temp: {
    quantity: 'temperature',
    min: -60, max: 50,
    stops: [
      [-60, [90, 0, 140]], [-40, [0, 0, 180]], [0, [0, 180, 230]],
      [15, [60, 200, 60]], [30, [240, 160, 0]], [50, [220, 0, 0]],
    ],
    alpha: () => 140,
    ticks: [-40, -20, 0, 20, 40],
  },
  pressure: {
    unit: 'hPa',
    min: 980, max: 1040,
    stops: [[980, [0, 0, 255]], [1010, [255, 255, 255]], [1040, [255, 0, 0]]],
    alpha: () => 130,
    ticks: [980, 995, 1010, 1025, 1040],
  },
  humidity: {
    unit: '%',
    min: 0, max: 1,
    stops: [[0, [255, 255, 80]], [1, [51, 153, 255]]],
    alpha: () => 130,
    ticks: [0, 0.25, 0.5, 0.75, 1],
    format: v => `${Math.round(v * 100)}`,
  },
  precip: {
    unit: 'mm/h',
    min: 0, max: 20,
    stops: [[0, [30, 100, 255]], [20, [230, 255, 255]]],
    alpha: v => (v < 0.1 ? 0 : Math.min(220, 80 + v * 10)),
    ticks: [0, 5, 10, 15, 20],
  },
  storm: {
    unit: 'index',
    min: 0, max: 50,
    stops: [[0, [0, 0, 0]], [10, [204, 204, 0]], [25, [255, 128, 0]], [50, [255, 0, 0]]],
    alpha: v => (v < 0.5 ? 0 : Math.min(200, v * 6)),
    ticks: [0, 10, 25, 50],
  },
}

const lutCache = new Map()

// RGBA lookup table with 256 entries spanning [min, max].
export function colorLut(id) {
  if (lutCache.has(id)) return lutCache.get(id)
  const scale = SCALES[id]
  if (!scale) return null
  const lut = new Uint8ClampedArray(256 * 4)
  for (let i = 0; i < 256; i++) {
    const value = scale.min + (i / 255) * (scale.max - scale.min)
    const [r, g, b] = interpolate(scale.stops, value)
    lut[i * 4] = r
    lut[i * 4 + 1] = g
    lut[i * 4 + 2] = b
    lut[i * 4 + 3] = clamp(Math.round(scale.alpha(value)), 0, 255)
  }
  lutCache.set(id, lut)
  return lut
}

export function lutIndex(id, value) {
  const scale = SCALES[id]
  if (!scale || !Number.isFinite(value)) return 0
  return clamp(Math.round(((value - scale.min) / (scale.max - scale.min)) * 255), 0, 255)
}

// CSS gradient matching the LUT colours (opaque, for the legend bar).
export function legendGradient(id, steps = 12) {
  const scale = SCALES[id]
  if (!scale) return 'transparent'
  const parts = []
  for (let i = 0; i <= steps; i++) {
    const value = scale.min + (i / steps) * (scale.max - scale.min)
    const [r, g, b] = interpolate(scale.stops, value)
    parts.push(`rgb(${r} ${g} ${b}) ${((i / steps) * 100).toFixed(1)}%`)
  }
  return `linear-gradient(90deg, ${parts.join(', ')})`
}

export function tickPosition(id, value) {
  const scale = SCALES[id]
  return clamp((value - scale.min) / (scale.max - scale.min), 0, 1)
}
