import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const N = 30000
const R = 2.018  // just above globe surface

export default function WindParticles({ windDirection = 0, windSpeed = 3 }) {
  const pointsRef = useRef()
  // Store lat/lon for each particle
  const latLon = useRef(new Float32Array(N * 2))
  const ages   = useRef(new Float32Array(N))

  const { positions, colors } = useMemo(() => {
    const pos = new Float32Array(N * 3)
    const col = new Float32Array(N * 3)
    for (let i = 0; i < N; i++) {
      const lat = (Math.random() - 0.5) * Math.PI
      const lon = Math.random() * Math.PI * 2
      latLon.current[i * 2]     = lat
      latLon.current[i * 2 + 1] = lon
      ages.current[i] = Math.random() * 5

      pos[i * 3]     = R * Math.cos(lat) * Math.sin(lon)
      pos[i * 3 + 1] = R * Math.sin(lat)
      pos[i * 3 + 2] = R * Math.cos(lat) * Math.cos(lon)

      // Blue-cyan-white gradient
      const t = Math.random()
      col[i * 3]     = 0.2 + t * 0.8
      col[i * 3 + 1] = 0.6 + t * 0.4
      col[i * 3 + 2] = 1.0
    }
    return { positions: pos, colors: col }
  }, [])

  useFrame((_, delta) => {
    if (!pointsRef.current) return
    const dir = (windDirection * Math.PI) / 180
    const spd = Math.max(0.2, windSpeed) * 0.00015 * delta * 60

    const posAttr = pointsRef.current.geometry.attributes.position
    const ll = latLon.current
    const ag = ages.current

    const dLon = Math.cos(dir) * spd
    const dLat = Math.sin(dir) * spd * 0.4

    for (let i = 0; i < N; i++) {
      ag[i] += delta

      ll[i * 2]     += dLat
      ll[i * 2 + 1] += dLon

      // Wrap
      if (ll[i * 2] >  Math.PI / 2) ll[i * 2] = -Math.PI / 2 + 0.01
      if (ll[i * 2] < -Math.PI / 2) ll[i * 2] =  Math.PI / 2 - 0.01
      if (ll[i * 2 + 1] > Math.PI * 2) ll[i * 2 + 1] -= Math.PI * 2
      if (ll[i * 2 + 1] < 0)           ll[i * 2 + 1] += Math.PI * 2

      // Respawn randomly
      if (ag[i] > 3.5 + Math.random() * 3) {
        ll[i * 2]     = (Math.random() - 0.5) * Math.PI
        ll[i * 2 + 1] = Math.random() * Math.PI * 2
        ag[i] = 0
      }

      const lat = ll[i * 2]
      const lon = ll[i * 2 + 1]
      const cosLat = Math.cos(lat)
      posAttr.array[i * 3]     = R * cosLat * Math.sin(lon)
      posAttr.array[i * 3 + 1] = R * Math.sin(lat)
      posAttr.array[i * 3 + 2] = R * cosLat * Math.cos(lon)
    }
    posAttr.needsUpdate = true
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={N} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-color"    count={N} array={colors}    itemSize={3} />
      </bufferGeometry>
      <pointsMaterial
        size={0.007}
        vertexColors
        transparent
        opacity={0.65}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  )
}
