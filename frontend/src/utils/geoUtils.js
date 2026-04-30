// Shared coordinate utilities — used by all 3D globe components
// Three.js SphereGeometry convention: lon=0 → +X axis
// Correct mapping: x = -r·cos(lat)·cos(lon+180°), y = r·sin(lat), z = r·cos(lat)·sin(lon+180°)

export const GLOBE_RADIUS = 2.0

export function latLonToVec3(lat, lon, r = GLOBE_RADIUS) {
  const latR = (lat * Math.PI) / 180
  const lonR = ((lon + 180) * Math.PI) / 180
  return {
    x: -r * Math.cos(latR) * Math.cos(lonR),
    y:  r * Math.sin(latR),
    z:  r * Math.cos(latR) * Math.sin(lonR),
  }
}

export function vec3ToLatLon(x, y, z, r = GLOBE_RADIUS) {
  const lat = Math.asin(y / r) * 180 / Math.PI
  const lon = Math.atan2(z, -x) * 180 / Math.PI - 180
  return { lat, lon }
}

// Grid geometry: rows 0-35 → lat -87.5…+87.5 (step 5°), cols 0-71 → lon -177.5…+177.5 (step 5°)
export const GRID_ROWS = 36
export const GRID_COLS = 72

export function gridIdx(r, c) { return r * GRID_COLS + c }

// Bilinear-interpolated sample from a flat array of size ROWS×COLS.
// Optional rows/cols override for when live gridData dimensions differ.
export function sampleGrid(lat, lon, arr, rows = GRID_ROWS, cols = GRID_COLS) {
  const fr = (lat + 87.5) / 5            // fractional row  (5° step, origin at -87.5)
  const fc = ((lon + 177.5) / 5 + cols) % cols   // fractional col (wrapped)

  const r0 = Math.max(0, Math.min(rows - 1, Math.floor(fr)))
  const r1 = Math.max(0, Math.min(rows - 1, r0 + 1))
  const c0 = Math.floor(fc) % cols
  const c1 = (c0 + 1) % cols
  const tr = fr - Math.floor(fr)
  const tc = fc - Math.floor(fc)

  const v00 = arr[r0 * cols + c0] || 0
  const v01 = arr[r0 * cols + c1] || 0
  const v10 = arr[r1 * cols + c0] || 0
  const v11 = arr[r1 * cols + c1] || 0

  return v00 * (1 - tr) * (1 - tc)
       + v01 * (1 - tr) * tc
       + v10 * tr * (1 - tc)
       + v11 * tr * tc
}

// Local east unit vector on sphere at (lat, lon) — used for wind particle advection
// East = ∂pos/∂lon (normalized): (sin(lonR), 0, cos(lonR))
export function eastVec(lon) {
  const lonR = ((lon + 180) * Math.PI) / 180
  return { x: Math.sin(lonR), y: 0, z: Math.cos(lonR) }
}

// Local north unit vector: (sin(lat)·cos(lonR), cos(lat), -sin(lat)·sin(lonR))
export function northVec(lat, lon) {
  const latR = (lat * Math.PI) / 180
  const lonR = ((lon + 180) * Math.PI) / 180
  return {
    x:  Math.sin(latR) * Math.cos(lonR),
    y:  Math.cos(latR),
    z: -Math.sin(latR) * Math.sin(lonR),
  }
}
