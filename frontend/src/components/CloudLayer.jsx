import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { TextureLoader } from 'three'
import * as THREE from 'three'
import { sunDirection } from '../utils/geoUtils'

const cloudVertexShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    vUv = uv;
    vNormal = normalize(normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
// The cloud pattern scrolls with the westerlies while the density mask stays
// pinned to the simulation grid, so cloud cover always sits over humid/rainy
// cells. (Rotating the whole mesh used to drift the mask off the grid.)
const cloudFragmentShader = `
  uniform sampler2D cloudTex;
  uniform sampler2D densityTex;
  uniform float cloudOpacity;
  uniform float scroll;
  uniform vec3 sunDir;
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    vec4 cloud = texture2D(cloudTex, vec2(vUv.x + scroll, vUv.y));
    float density = texture2D(densityTex, vUv).r;
    // A white texture with an alpha mask uses the alpha; an opaque grayscale
    // texture (the shipped clouds.webp) uses its luminance. (max(alpha,
    // luminance) made every white texel fully opaque, turning thin cloud into
    // solid white blocks.)
    float lum = dot(cloud.rgb, vec3(0.299, 0.587, 0.114));
    float pattern = cloud.a < 0.99 ? cloud.a : lum;
    float alpha = pattern * clamp(density, 0.0, 1.0) * cloudOpacity;
    // Clouds share the Earth's day/night terminator.
    float day = smoothstep(-0.15, 0.35, dot(normalize(vNormal), normalize(sunDir)));
    gl_FragColor = vec4(vec3(0.97) * (0.1 + 0.9 * day), alpha);
  }
`

export default function CloudLayer({ gridData, animate = true }) {
  const meshRef = useRef()
  // Grayscale WebP: the cloud mask baked from the original RGBA texture
  // (alpha, or luminance where it was opaque), 63 KB instead of 260 KB.
  const cloudTex = useLoader(TextureLoader, '/textures/clouds.webp')
  const rows = gridData?.rows || 36
  const cols = gridData?.cols || 72

  useEffect(() => {
    cloudTex.wrapS = THREE.RepeatWrapping
    cloudTex.needsUpdate = true
  }, [cloudTex])

  // 8-bit red texture: linear filtering of float textures is optional in
  // WebGL and missing on many phones, which used to blank the clouds there.
  const { densityData, densityTex } = useMemo(() => {
    const pixels = new Uint8Array(rows * cols)
    const tex = new THREE.DataTexture(pixels, cols, rows, THREE.RedFormat, THREE.UnsignedByteType)
    tex.minFilter = tex.magFilter = THREE.LinearFilter
    tex.wrapS = THREE.RepeatWrapping
    tex.wrapT = THREE.ClampToEdgeWrapping
    tex.unpackAlignment = 1
    tex.needsUpdate = true
    return { densityData: pixels, densityTex: tex }
  }, [rows, cols])

  useEffect(() => () => densityTex.dispose(), [densityTex])

  useEffect(() => {
    const H = gridData?.H
    const R = gridData?.R
    if (!H || !R) return
    const n = Math.min(densityData.length, H.length, R.length)
    for (let i = 0; i < n; i++) {
      const d = (H[i] || 0) * 0.8 + (R[i] || 0) * 0.5
      densityData[i] = Math.round(Math.min(1, Math.max(0, d)) * 255)
    }
    densityTex.needsUpdate = true
  }, [gridData, densityData, densityTex])

  const uniforms = useMemo(() => ({
    cloudTex: { value: cloudTex },
    densityTex: { value: densityTex },
    cloudOpacity: { value: 0.8 },
    scroll: { value: 0 },
    sunDir: { value: new THREE.Vector3(1, 0, 0) },
  }), [cloudTex, densityTex])

  const avgWind = gridData?.avgWind ?? 6
  useFrame((_, delta) => {
    const sun = sunDirection()
    uniforms.sunDir.value.set(sun.x, sun.y, sun.z)
    if (!animate) return
    // Slow eastward drift, a little faster when the model is windier.
    const u = uniforms.scroll
    u.value = (u.value - delta * 0.0012 * (0.5 + avgWind / 12)) % 1
  })

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[2.04, 64, 48]} />
      <shaderMaterial
        vertexShader={cloudVertexShader}
        fragmentShader={cloudFragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
      />
    </mesh>
  )
}
