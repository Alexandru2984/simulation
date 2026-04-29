import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const N_RAIN = 8000

export default function RainParticles({ pressure = 1013, active = false }) {
  const pointsRef = useRef()
  const radii = useRef(new Float32Array(N_RAIN))

  const { positions } = useMemo(() => {
    const pos = new Float32Array(N_RAIN * 3)
    for (let i = 0; i < N_RAIN; i++) {
      const lat = (Math.random() - 0.5) * Math.PI
      const lon = Math.random() * Math.PI * 2
      const r = 2.08 + Math.random() * 0.25
      radii.current[i] = r
      pos[i * 3]     = r * Math.cos(lat) * Math.sin(lon)
      pos[i * 3 + 1] = r * Math.sin(lat)
      pos[i * 3 + 2] = r * Math.cos(lat) * Math.cos(lon)
    }
    return { positions: pos }
  }, [])

  const intensity = Math.max(0, Math.min(1, (1012 - pressure) / 15))

  useFrame((_, delta) => {
    if (!pointsRef.current || !active) return
    const posAttr = pointsRef.current.geometry.attributes.position
    const spd = 0.012 * delta * 60

    for (let i = 0; i < N_RAIN; i++) {
      radii.current[i] -= spd
      if (radii.current[i] < 2.01) {
        // Respawn at cloud layer
        radii.current[i] = 2.08 + Math.random() * 0.25
        const lat = (Math.random() - 0.5) * Math.PI
        const lon = Math.random() * Math.PI * 2
        const r = radii.current[i]
        posAttr.array[i * 3]     = r * Math.cos(lat) * Math.sin(lon)
        posAttr.array[i * 3 + 1] = r * Math.sin(lat)
        posAttr.array[i * 3 + 2] = r * Math.cos(lat) * Math.cos(lon)
      } else {
        // Move radially inward
        const r = radii.current[i]
        const ox = posAttr.array[i * 3]
        const oy = posAttr.array[i * 3 + 1]
        const oz = posAttr.array[i * 3 + 2]
        const len = Math.sqrt(ox * ox + oy * oy + oz * oz)
        const scale = r / len
        posAttr.array[i * 3]     = ox * scale
        posAttr.array[i * 3 + 1] = oy * scale
        posAttr.array[i * 3 + 2] = oz * scale
      }
    }
    posAttr.needsUpdate = true
  })

  if (!active) return null

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={N_RAIN} array={positions} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial
        size={0.004}
        color={new THREE.Color(0.5, 0.8, 1.0)}
        transparent
        opacity={0.45 + intensity * 0.35}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  )
}
