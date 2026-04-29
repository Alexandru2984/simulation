// GridOverlay — renders the 18×36 simulation grid as a coloured DataTexture
// draped over the globe as a semi-transparent sphere slightly above Earth.
import { useRef, useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// ── Colour maps ───────────────────────────────────────────────────────────────
function tempColor(t) {
  // -40°C → deep blue … 0°C → cyan … 15°C → green … 30°C → orange … 50°C → red
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
  // 980 hPa → deep blue … 1013 → white … 1040 → deep red
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
  // 0 → pale yellow … 1 → deep blue
  const f = Math.max(0, Math.min(1, h))
  return [
    Math.round(255 * (1 - f * 0.8)),
    Math.round(255 * (1 - f * 0.4)),
    Math.round(80 + 175 * f),
  ]
}

function precipColor(r) {
  // 0 → transparent, >0.5 → blue, >5 → cyan, >20 → white
  if (r < 0.1) return null  // fully transparent
  const f = Math.min(1, r / 20)
  return [
    Math.round(30  + f * 200),
    Math.round(100 + f * 155),
    255,
  ]
}

const ROWS = 18, COLS = 36

// ── Component ─────────────────────────────────────────────────────────────────
export default function GridOverlay({ gridData, mode = 'temp' }) {
  const texRef = useRef(null)
  const meshRef = useRef(null)

  // Create a 360×180 DataTexture (10× upscaled from 36×18 for smoothness)
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
    const { T, P, H, R } = gridData

    // Fill texture: each pixel (tx, ty) maps to a grid cell via bilinear sample
    for (let ty = 0; ty < TEX_H; ty++) {
      for (let tx = 0; tx < TEX_W; tx++) {
        // Map texture pixel to fractional grid coords
        const gc = (tx / TEX_W) * COLS
        const gr = (ty / TEX_H) * ROWS

        // Bilinear interpolation
        const c0 = Math.floor(gc) % COLS, c1 = (c0 + 1) % COLS
        const r0 = Math.min(Math.floor(gr), ROWS - 1)
        const r1 = Math.min(r0 + 1, ROWS - 1)
        const fc = gc - Math.floor(gc), fr = gr - Math.floor(gr)

        const mix = (arr) =>
          arr[r0 * COLS + c0] * (1 - fc) * (1 - fr) +
          arr[r0 * COLS + c1] * fc       * (1 - fr) +
          arr[r1 * COLS + c0] * (1 - fc) * fr +
          arr[r1 * COLS + c1] * fc       * fr

        const base = (ty * TEX_W + tx) * 4
        let rgb, alpha = 160  // default semi-transparent

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
