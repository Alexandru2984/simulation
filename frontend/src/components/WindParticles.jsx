import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { sampleGrid, latLonToVec3, vec3ToLatLon, GLOBE_RADIUS } from '../utils/geoUtils'
import { useFPS } from '../hooks/useFPS'

const N = 20000        // particle count (reduced from 30k for mobile perf)
const R = GLOBE_RADIUS + 0.018
const MAX_AGE = 8      // seconds before respawn
const SPEED_SCALE = 0.00018  // m/s → degrees/frame scale

// Random lat/lon with area-correct distribution (cos(lat) weighting)
function randLatLon() {
  const lat = Math.asin(Math.random() * 2 - 1) * 180 / Math.PI
  const lon = Math.random() * 360 - 180
  return { lat, lon }
}

export default function WindParticles({ gridData }) {
  const pointsRef = useRef()

  const fps = useFPS()
  const particleBudget = fps >= 45 ? 8192 : fps >= 30 ? 4096 : fps >= 20 ? 2048 : 1024
  const budgetRef = useRef(8192)
  budgetRef.current = particleBudget

  // Per-particle state stored in typed arrays
  const state = useMemo(() => {
    const lats = new Float32Array(N)
    const lons = new Float32Array(N)
    const ages = new Float32Array(N)
    const lifetimes = new Float32Array(N)
    for (let i = 0; i < N; i++) {
      const { lat, lon } = randLatLon()
      lats[i] = lat; lons[i] = lon
      ages[i] = Math.random() * MAX_AGE
      lifetimes[i] = MAX_AGE * (0.5 + Math.random() * 0.5)
    }
    return { lats, lons, ages, lifetimes }
  }, [])

  const buffers = useMemo(() => ({
    positions: new Float32Array(N * 3),
    colors:    new Float32Array(N * 3),
  }), [])

  // Latest grid data in a ref to avoid closure staleness
  const gridRef = useRef(null)
  useEffect(() => { gridRef.current = gridData }, [gridData])

  useFrame((_, delta) => {
    if (!pointsRef.current) return
    const g = gridRef.current
    const { lats, lons, ages, lifetimes } = state
    const { positions, colors } = buffers
    const budget = budgetRef.current

    // Local east/north tangent vectors (reusable)
    for (let i = 0; i < budget; i++) {
      ages[i] += delta

      // Respawn old particles
      if (ages[i] > lifetimes[i]) {
        const { lat, lon } = randLatLon()
        lats[i] = lat; lons[i] = lon
        ages[i] = 0
        lifetimes[i] = MAX_AGE * (0.5 + Math.random() * 0.5)
      }

      let lat = lats[i], lon = lons[i]

      // Sample U/V from grid (bilinear), or use gentle default when no data
      let U = 0, V = 0
      if (g?.U && g?.V) {
        U = sampleGrid(lat, lon, g.U)
        V = sampleGrid(lat, lon, g.V)
      } else {
        // Fallback: gentle trade-wind-like westward flow at low latitudes
        U = -3 * Math.cos(lat * Math.PI / 180)
        V = 0
      }

      const spd = Math.sqrt(U * U + V * V)

      // Advect on sphere: dLat = V*scale, dLon = U*scale/cos(lat) (in degrees)
      const cosLat = Math.max(Math.cos(lat * Math.PI / 180), 0.12)
      const dt60 = delta * 60  // normalize to ~60fps
      lat += V * SPEED_SCALE * dt60
      lon += (U * SPEED_SCALE * dt60) / cosLat

      // Wrap longitude, clamp latitude (respawn if at poles)
      if (lon > 180) lon -= 360
      if (lon < -180) lon += 360
      if (lat > 85 || lat < -85) {
        const { lat: nl, lon: nl2 } = randLatLon()
        lat = nl; lon = nl2; ages[i] = 0
      }

      lats[i] = lat; lons[i] = lon

      // Convert to 3D
      const latR = (lat * Math.PI) / 180
      const lonR = ((lon + 180) * Math.PI) / 180
      positions[i * 3]     = -R * Math.cos(latR) * Math.cos(lonR)
      positions[i * 3 + 1] =  R * Math.sin(latR)
      positions[i * 3 + 2] =  R * Math.cos(latR) * Math.sin(lonR)

      // Color by speed: slow=blue, medium=cyan, fast=white
      const t = Math.min(spd / 25, 1)
      const fade = Math.min(1, (lifetimes[i] - ages[i]) / 1.5) * 0.7 + 0.1
      colors[i * 3]     = 0.15 + t * 0.85        // R: 0→1
      colors[i * 3 + 1] = 0.55 + t * 0.45        // G: 0.55→1
      colors[i * 3 + 2] = fade                    // B: fade out at end of life
    }

    const geo = pointsRef.current.geometry
    geo.setDrawRange(0, budget)
    geo.attributes.position.needsUpdate = true
    geo.attributes.color.needsUpdate = true
  })

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(buffers.positions, 3))
    g.setAttribute('color',    new THREE.BufferAttribute(buffers.colors, 3))
    return g
  }, [buffers])

  const material = useMemo(() => new THREE.PointsMaterial({
    size: 0.004,
    vertexColors: true,
    transparent: true,
    opacity: 0.7,
    sizeAttenuation: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), [])

  return <points ref={pointsRef} geometry={geometry} material={material} />
}
