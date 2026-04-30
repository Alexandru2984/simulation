// GridOverlay — renders the simulation grid as a coloured DataTexture
// draped over the globe as a semi-transparent sphere slightly above Earth.
import { useRef, useEffect, useMemo } from 'react'
import * as THREE from 'three'

// ── Colour maps ───────────────────────────────────────────────────────────────
function tempColor(t) {
  const stops = [
    [-40, [0,   0,   180]],
    [  0, [0,   180, 230]],
    [ 15, [60,  200, 60 ]],
    [ 30, [240, 160, 0  ]],
    [ 50, [220, 0,   0  ]],
  ]
  for (let i = 1; i < stops.length; i++) {
    const [t0, c0] = stops[i - 1]
    const [t1, c1] = stops[i]
    if (t <= t1) {
      const f = (t - t0) / (t1 - t0)
      return c0.map((v, k) => Math.round(v + f * (c1[k] - v)))
    }
  }
  return stops[stops.length - 1][1]
}

function pressureColor(p) {
  const n = Math.max(0, Math.min(1, (p - 980) / 60))
  if (n < 0.5) {
    const f = n * 2
    return [Math.round(f * 255), Math.round(f * 255), 255]
  } else {
    const f = (n - 0.5) * 2
    return [255, Math.round((1 - f) * 255), Math.round((1 - f) * 255)]
  }
}

function humidityColor(h) {
  const f = Math.max(0, Math.min(1, h))
  return [
    Math.round(255 * (1 - f * 0.8)),
    Math.round(255 * (1 - f * 0.4)),
    Math.round(80 + 175 * f),
  ]
}

function precipColor(r) {
  if (r < 0.1) return null
  const f = Math.min(1, r / 20)
  return [
    Math.round(30  + f * 200),
    Math.round(100 + f * 155),
    255,
  ]
}

function stormColor(sp) {
  if (sp < 0.5) return null  // transparent
  if (sp <= 10) {
    const f = sp / 10
    return [Math.round(204 * f), Math.round(204 * f), 0]     // black → yellow
  } else if (sp <= 25) {
    const f = (sp - 10) / 15
    return [Math.round(204 + 51 * f), Math.round(204 - 76 * f), 0]  // yellow → orange
  } else {
    const f = Math.min(1, (sp - 25) / 25)
    return [255, Math.round(128 * (1 - f)), 0]               // orange → red
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function GridOverlay({ gridData, mode = 'temp' }) {
  const texRef  = useRef(null)
  const meshRef = useRef(null)

  const TEX_W = 360, TEX_H = 180
  const texData = useMemo(() => new Uint8Array(TEX_W * TEX_H * 4), [])
  const texture  = useMemo(() => {
    const t = new THREE.DataTexture(texData, TEX_W, TEX_H, THREE.RGBAFormat)
    t.minFilter = t.magFilter = THREE.LinearFilter
    t.wrapS = THREE.RepeatWrapping
    t.needsUpdate = true
    return t
  }, [texData])

  useEffect(() => {
    if (!gridData) return
    const { T, P, H, R, SP } = gridData
    const ROWS = gridData.rows || 18
    const COLS = gridData.cols || 36

    for (let ty = 0; ty < TEX_H; ty++) {
      for (let tx = 0; tx < TEX_W; tx++) {
        const gc = (tx / TEX_W) * COLS
        const gr = (ty / TEX_H) * ROWS

        const c0 = Math.floor(gc) % COLS, c1 = (c0 + 1) % COLS
        const r0 = Math.min(Math.floor(gr), ROWS - 1)
        const r1 = Math.min(r0 + 1, ROWS - 1)
        const fc = gc - Math.floor(gc), fr = gr - Math.floor(gr)

        const mix = (arr) => {
          if (!arr) return 0
          return (arr[r0 * COLS + c0] || 0) * (1 - fc) * (1 - fr) +
                 (arr[r0 * COLS + c1] || 0) * fc       * (1 - fr) +
                 (arr[r1 * COLS + c0] || 0) * (1 - fc) * fr +
                 (arr[r1 * COLS + c1] || 0) * fc       * fr
        }

        const base = (ty * TEX_W + tx) * 4
        let rgb, alpha = 160

        if (mode === 'temp') {
          rgb = tempColor(mix(T)); alpha = 140
        } else if (mode === 'pressure') {
          rgb = pressureColor(mix(P)); alpha = 130
        } else if (mode === 'humidity') {
          rgb = humidityColor(mix(H)); alpha = 130
        } else if (mode === 'precip') {
          const val = mix(R)
          const c = precipColor(val)
          if (!c) { texData[base+3] = 0; continue }
          rgb = c; alpha = Math.min(220, 80 + val * 10)
        } else if (mode === 'storm') {
          const val = mix(SP)
          const c = stormColor(val)
          if (!c) { texData[base+3] = 0; continue }
          rgb = c; alpha = Math.min(200, Math.max(0, val * 6))
        } else {
          texData[base+3] = 0; continue
        }

        texData[base]   = rgb[0]
        texData[base+1] = rgb[1]
        texData[base+2] = rgb[2]
        texData[base+3] = alpha
      }
    }

    texture.needsUpdate = true
  }, [gridData, mode, texData, texture])

  if (!gridData) return null

  return (
    <mesh ref={meshRef} renderOrder={1}>
      <sphereGeometry args={[2.02, 64, 32]} />
      <meshBasicMaterial
        map={texture}
        transparent
        depthWrite={false}
        side={THREE.FrontSide}
        blending={THREE.NormalBlending}
      />
    </mesh>
  )
}
