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

// Wraps any longitude into [-180, 180).
export function normalizeLon(lon) {
  return ((((lon + 180) % 360) + 360) % 360) - 180
}

export function vec3ToLatLon(x, y, z, r = Math.hypot(x, y, z) || GLOBE_RADIUS) {
  const lat = Math.asin(Math.max(-1, Math.min(1, y / r))) * 180 / Math.PI
  const lon = normalizeLon(Math.atan2(z, -x) * 180 / Math.PI - 180)
  return { lat, lon }
}

// A surface point is visible when it faces the camera: (cam - p) · p > 0.
export function facesCamera(point, camera) {
  const p2 = point.x * point.x + point.y * point.y + point.z * point.z
  return camera.x * point.x + camera.y * point.y + camera.z * point.z > p2
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

// Unit vector towards the sun in globe space for a given instant. Lon 0° is
// +X and lon −90° is +Z (see latLonToVec3); the sub-solar point sits over
// lon −15°·(UTC hours − 12) at the solar declination.
export function sunDirection(date = new Date()) {
  const utcSec = date.getUTCHours() * 3600 + date.getUTCMinutes() * 60 + date.getUTCSeconds()
  const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 0)
  const dayOfYear = Math.floor((date.getTime() - startOfYear) / 86400000)
  const decl = 23.44 * (Math.PI / 180) * Math.sin((2 * Math.PI * (284 + dayOfYear)) / 365)
  const hourAngle = (utcSec / 86400 - 0.5) * 2 * Math.PI
  return {
    x: Math.cos(decl) * Math.cos(hourAngle),
    y: Math.sin(decl),
    z: Math.cos(decl) * Math.sin(hourAngle),
  }
}
