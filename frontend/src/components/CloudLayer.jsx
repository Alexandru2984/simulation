import { useRef, useMemo, useEffect } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { TextureLoader } from 'three'
import * as THREE from 'three'

const cloudVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const cloudFragmentShader = `
  uniform sampler2D cloudTex;
  uniform sampler2D densityTex;
  uniform float cloudOpacity;
  varying vec2 vUv;
  void main() {
    vec4 cloud = texture2D(cloudTex, vUv);
    float density = texture2D(densityTex, vUv).r;
    float pattern = max(cloud.a, dot(cloud.rgb, vec3(0.299, 0.587, 0.114)));
    float alpha = pattern * clamp(density, 0.0, 1.0) * cloudOpacity;
    gl_FragColor = vec4(cloud.rgb + vec3(1.0 - cloud.r) * 0.1, alpha);
  }
`

export default function CloudLayer({ windDirection = 0, windSpeed = 3, gridData }) {
  const meshRef = useRef()
  const cloudTex = useLoader(TextureLoader, '/textures/clouds.png')

  // Per-cell density data texture (filled from H[] + R[])
  const densityData = useMemo(() => new Float32Array(72 * 36), [])
  const densityTex = useMemo(() => {
    const t = new THREE.DataTexture(densityData, 72, 36, THREE.RedFormat, THREE.FloatType)
    t.minFilter = t.magFilter = THREE.LinearFilter
    t.needsUpdate = true
    return t
  }, [densityData])

  useEffect(() => {
    if (!gridData) return
    const { H, R, rows = 36, cols = 72 } = gridData
    if (!H || !R) return
    const n = rows * cols
    for (let i = 0; i < n && i < densityData.length; i++) {
      densityData[i] = Math.min(1, Math.max(0, (H[i] || 0) * 0.8 + (R[i] || 0) * 0.5))
    }
    densityTex.needsUpdate = true
  }, [gridData, densityData, densityTex])

  const uniforms = useMemo(() => ({
    cloudTex:    { value: cloudTex },
    densityTex:  { value: densityTex },
    cloudOpacity: { value: 0.75 },
  }), [cloudTex, densityTex])

  useFrame((_, delta) => {
    if (!meshRef.current) return
    const speed = (windSpeed / 20) * delta * 0.12
    meshRef.current.rotation.y += Math.cos(windDirection * Math.PI / 180) * speed
    meshRef.current.rotation.x += Math.sin(windDirection * Math.PI / 180) * speed * 0.1
  })

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[2.04, 48, 48]} />
      <shaderMaterial
        vertexShader={cloudVertexShader}
        fragmentShader={cloudFragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        side={THREE.FrontSide}
        blending={THREE.NormalBlending}
      />
    </mesh>
  )
}
