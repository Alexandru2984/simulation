// IsobarLines — draws pressure contour lines using marching squares on the 36×72 grid.
// Only rendered when the 'pressure' overlay is active.
import { useMemo } from 'react'
import * as THREE from 'three'
import { GLOBE_RADIUS, sampleGrid } from '../utils/geoUtils'

const ROWS = 36, COLS = 72
const LAT0 = -87.5, LON0 = -177.5, STEP = 5
const R = GLOBE_RADIUS + 0.027   // above GridOverlay (2.02) and Earth (2.0)

const LEVELS = [985, 990, 995, 1000, 1005, 1010, 1015, 1020, 1025, 1030]

// Marching-squares edge table.
// Corner bit ordering:  caseIdx = v_bl | (v_br<<1) | (v_tr<<2) | (v_tl<<3)
// Edge numbers: 0=bottom(bl→br)  1=right(br→tr)  2=top(tl→tr)  3=left(bl→tl)
const EDGE_TABLE = [
  [],           [[0,3]],       [[0,1]],       [[1,3]],
  [[1,2]],      [[0,3],[1,2]], [[0,2]],       [[2,3]],
  [[2,3]],      [[0,2]],       [[0,1],[2,3]], [[1,2]],
  [[1,3]],      [[0,1]],       [[0,3]],       [],
]

function project(lat, lon) {
  const latR = lat * Math.PI / 180
  const lonR = (lon + 180) * Math.PI / 180
  return [
    -R * Math.cos(latR) * Math.cos(lonR),
     R * Math.sin(latR),
     R * Math.cos(latR) * Math.sin(lonR),
  ]
}

function lerpT(level, a, b) {
  const d = b - a
  if (Math.abs(d) < 0.001) return 0.5
  return Math.max(0, Math.min(1, (level - a) / d))
}

// Returns projected [x,y,z] of the iso-level crossing on a given cell edge.
// p_bl/br/tl/tr = pressure at the four corners (bl=bottom-left, etc.)
function edgePoint(level, lat_b, lon_l, edge, p_bl, p_br, p_tl, p_tr) {
  switch (edge) {
    case 0: { // bottom: BL → BR  (lat fixed = lat_b)
      const t = lerpT(level, p_bl, p_br)
      return project(lat_b, lon_l + t * STEP)
    }
    case 1: { // right:  BR → TR  (lon fixed = lon_l + STEP)
      const t = lerpT(level, p_br, p_tr)
      return project(lat_b + t * STEP, lon_l + STEP)
    }
    case 2: { // top:    TL → TR  (lat fixed = lat_b + STEP)
      const t = lerpT(level, p_tl, p_tr)
      return project(lat_b + STEP, lon_l + t * STEP)
    }
    case 3: { // left:   BL → TL  (lon fixed = lon_l)
      const t = lerpT(level, p_bl, p_tl)
      return project(lat_b + t * STEP, lon_l)
    }
    default: return null
  }
}

export default function IsobarLines({ gridData, active }) {
  const geometry = useMemo(() => {
    if (!gridData?.P || !active) return null
    const P = gridData.P

    const pos = []
    const col = []

    LEVELS.forEach(level => {
      // Blue (low) → red (high) colour ramp
      const t  = (level - 985) / 45
      const cr = 0.2 + t * 0.8
      const cg = 0.3
      const cb = 1.0 - t * 0.8

      // Skip last column to avoid antimeridian seam artefacts
      for (let r = 0; r < ROWS - 1; r++) {
        for (let c = 0; c < COLS - 1; c++) {
          const p_bl = P[ r      * COLS + c    ]
          const p_br = P[ r      * COLS + c + 1]
          const p_tl = P[(r + 1) * COLS + c    ]
          const p_tr = P[(r + 1) * COLS + c + 1]

          if (isNaN(p_bl) || isNaN(p_br) || isNaN(p_tl) || isNaN(p_tr)) continue

          const caseIdx =
            (p_bl >= level ? 1 : 0) |
            (p_br >= level ? 2 : 0) |
            (p_tr >= level ? 4 : 0) |
            (p_tl >= level ? 8 : 0)

          const segs = EDGE_TABLE[caseIdx]
          if (!segs.length) continue

          const lat_b = LAT0 + r * STEP
          const lon_l = LON0 + c * STEP

          segs.forEach(([e1, e2]) => {
            const pt1 = edgePoint(level, lat_b, lon_l, e1, p_bl, p_br, p_tl, p_tr)
            const pt2 = edgePoint(level, lat_b, lon_l, e2, p_bl, p_br, p_tl, p_tr)
            if (!pt1 || !pt2) return
            pos.push(...pt1, ...pt2)
            col.push(cr, cg, cb, cr, cg, cb)
          })
        }
      }
    })

    if (pos.length === 0) return null
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setAttribute('color',    new THREE.Float32BufferAttribute(col, 3))
    return geo
  }, [gridData?.P, active])

  if (!geometry) return null

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial vertexColors transparent opacity={0.7} depthWrite={false} />
    </lineSegments>
  )
}
