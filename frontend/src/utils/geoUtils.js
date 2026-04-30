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

// Grid geometry: rows 0-17 → lat -85…+85 (step 10), cols 0-35 → lon -175…+175 (step 10)
export const GRID_ROWS = 18
export const GRID_COLS = 36

export function gridIdx(r, c) { return r * GRID_COLS + c }

// Bilinear-interpolated sample from a flat Float32/regular array of size ROWS×COLS
export function sampleGrid(lat, lon, arr) {
  const fr = (lat + 85) / 10            // fractional row
  const fc = ((lon + 175) / 10 + GRID_COLS) % GRID_COLS  // fractional col (wrapped)

  const r0 = Math.max(0, Math.min(GRID_ROWS - 1, Math.floor(fr)))
  const r1 = Math.max(0, Math.min(GRID_ROWS - 1, r0 + 1))
  const c0 = Math.floor(fc) % GRID_COLS
  const c1 = (c0 + 1) % GRID_COLS
  const tr = fr - Math.floor(fr)
  const tc = fc - Math.floor(fc)

  const v00 = arr[r0 * GRID_COLS + c0]
  const v01 = arr[r0 * GRID_COLS + c1]
  const v10 = arr[r1 * GRID_COLS + c0]
  const v11 = arr[r1 * GRID_COLS + c1]

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
