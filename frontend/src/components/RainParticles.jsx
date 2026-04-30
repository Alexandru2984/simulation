import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useFPS } from '../hooks/useFPS'

const N_RAIN = 8192
const SPHERE_MIN = 2.01
const SPHERE_SPAWN = 2.08
const SPHERE_JITTER = 0.25

// Build cumulative weight array from R[] for O(log n) weighted sampling
function buildCumul(R, rows, cols) {
  const n = rows * cols
  const cumul = new Float32Array(n)
  let total = 0
  for (let i = 0; i < n; i++) {
    total += Math.max(0, R[i] || 0)
    cumul[i] = total
  }
  return { cumul, totalR: total, rows, cols }
}

// Binary-search weighted random cell, returns { lat, lon } in degrees
function spawnInCell(cumul, totalR, rows, cols) {
  if (totalR <= 0) return null
  const t = Math.random() * totalR
  let lo = 0, hi = cumul.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (cumul[mid] < t) lo = mid + 1; else hi = mid
  }
  const row = Math.floor(lo / cols)
  const col = lo % cols
  const latStep = rows > 1 ? 175.0 / (rows - 1) : 5
  const lonStep = cols > 1 ? 355.0 / (cols - 1) : 5
  const lat = -87.5 + row * latStep + (Math.random() - 0.5) * latStep
  const lon = -177.5 + col * lonStep + (Math.random() - 0.5) * lonStep
  return { lat, lon }
}

// Nearest-cell U/V lookup
function sampleUV(lat, lon, U, V, rows, cols) {
  const latStep = rows > 1 ? 175.0 / (rows - 1) : 5
  const lonStep = cols > 1 ? 355.0 / (cols - 1) : 5
  const r = Math.max(0, Math.min(rows - 1, Math.round((lat + 87.5) / latStep)))
  const c = Math.max(0, Math.min(cols - 1, Math.round((lon + 177.5) / lonStep)))
  const idx = r * cols + c
  return { u: U[idx] || 0, v: V[idx] || 0 }
}

export default function RainParticles({ gridData }) {
  const pointsRef = useRef()
  const geoRef    = useRef()

  const fps = useFPS()
  const particleBudget = fps >= 45 ? 8192 : fps >= 30 ? 4096 : fps >= 20 ? 2048 : 1024
  const budgetRef = useRef(8192)
  budgetRef.current = particleBudget

  // Per-particle state
  const lats   = useRef(new Float32Array(N_RAIN))
  const lons   = useRef(new Float32Array(N_RAIN))
  const radii  = useRef(new Float32Array(N_RAIN))
  const cumulRef = useRef(null)

  // Build initial random positions
  const positions = useMemo(() => {
    const pos = new Float32Array(N_RAIN * 3)
    for (let i = 0; i < N_RAIN; i++) {
      const lat = (Math.random() - 0.5) * 160
      const lon = Math.random() * 360 - 180
      lats.current[i] = lat
      lons.current[i] = lon
      const r = SPHERE_SPAWN + Math.random() * SPHERE_JITTER
      radii.current[i] = r
      const latR = lat * Math.PI / 180
      const lonR = (lon + 180) * Math.PI / 180
      pos[i*3]   = -r * Math.cos(latR) * Math.cos(lonR)
      pos[i*3+1] =  r * Math.sin(latR)
      pos[i*3+2] =  r * Math.cos(latR) * Math.sin(lonR)
    }
    return pos
  }, [])

  // Rebuild cumulative weights when grid data changes
  useEffect(() => {
    if (!gridData?.R || !gridData?.rows || !gridData?.cols) {
      cumulRef.current = null
      return
    }
    cumulRef.current = buildCumul(gridData.R, gridData.rows, gridData.cols)
  }, [gridData])

  const gridRef = useRef(null)
  useEffect(() => { gridRef.current = gridData }, [gridData])

  useFrame((_, delta) => {
    if (!pointsRef.current) return
    const posAttr = pointsRef.current.geometry.attributes.position
    const budget = budgetRef.current
    pointsRef.current.geometry.setDrawRange(0, budget)
    const spd = 0.012 * delta * 60
    const windScale = 0.00004 * delta * 60
    const c = cumulRef.current
    const g = gridRef.current
    const hasRain = c && c.totalR > 0

    if (!hasRain) {
      for (let i = 0; i < budget; i++) {
        posAttr.array[i*3] = posAttr.array[i*3+1] = posAttr.array[i*3+2] = 9999
      }
      posAttr.needsUpdate = true
      return
    }

    for (let i = 0; i < budget; i++) {
      radii.current[i] -= spd
      if (radii.current[i] < SPHERE_MIN) {
        // Respawn at a rain-weighted cell
        const sp = spawnInCell(c.cumul, c.totalR, c.rows, c.cols)
        if (!sp) { posAttr.array[i*3] = posAttr.array[i*3+1] = posAttr.array[i*3+2] = 9999; continue }
        lats.current[i] = sp.lat
        lons.current[i] = sp.lon
        radii.current[i] = SPHERE_SPAWN + Math.random() * SPHERE_JITTER
      }

      let lat = lats.current[i]
      let lon = lons.current[i]

      // Wind drift
      if (g?.U && g?.V && g?.rows && g?.cols) {
        const { u, v } = sampleUV(lat, lon, g.U, g.V, g.rows, g.cols)
        const cosLat = Math.max(Math.cos(lat * Math.PI / 180), 0.12)
        lat += v * windScale
        lon += (u * windScale) / cosLat
        if (lon > 180) lon -= 360
        if (lon < -180) lon += 360
        lats.current[i] = lat
        lons.current[i] = lon
      }

      const r = radii.current[i]
      const latR = lat * Math.PI / 180
      const lonR = (lon + 180) * Math.PI / 180
      posAttr.array[i*3]   = -r * Math.cos(latR) * Math.cos(lonR)
      posAttr.array[i*3+1] =  r * Math.sin(latR)
      posAttr.array[i*3+2] =  r * Math.cos(latR) * Math.sin(lonR)
    }
    posAttr.needsUpdate = true
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry ref={geoRef}>
        <bufferAttribute attach="attributes-position" count={N_RAIN} array={positions} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial
        size={0.004}
        color={new THREE.Color(0.5, 0.8, 1.0)}
        transparent
        opacity={0.5}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  )
}
