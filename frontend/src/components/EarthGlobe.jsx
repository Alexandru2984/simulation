import { useRef, useMemo } from 'react'
import { useLoader } from '@react-three/fiber'
import { TextureLoader } from 'three'
import * as THREE from 'three'

const vertexShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const fragmentShader = `
  uniform sampler2D earthTexture;
  uniform sampler2D specularTexture;
  uniform float temperature;
  varying vec2 vUv;
  varying vec3 vNormal;

  vec3 tempTint(float t) {
    float n = clamp((t + 15.0) / 65.0, 0.0, 1.0);
    vec3 cold  = vec3(0.55, 0.75, 1.00);
    vec3 mid   = vec3(1.00, 1.00, 1.00);
    vec3 hot   = vec3(1.00, 0.50, 0.10);
    if (n < 0.5) return mix(cold, mid, n * 2.0);
    return mix(mid, hot, (n - 0.5) * 2.0);
  }

  void main() {
    vec4 earth = texture2D(earthTexture, vUv);
    vec4 spec  = texture2D(specularTexture, vUv);
    vec3 tint  = tempTint(temperature);
    // Blend tint only on land (low specular = land)
    float landMask = 1.0 - spec.r;
    vec3 color = mix(earth.rgb, earth.rgb * tint, landMask * 0.35);
    // Basic diffuse
    vec3 lightDir = normalize(vec3(1.0, 0.5, 1.0));
    float diff = max(dot(vNormal, lightDir), 0.1);
    gl_FragColor = vec4(color * diff, 1.0);
  }
`

export default function EarthGlobe({ temperature = 20, onGlobeClick }) {
  const meshRef = useRef()
  const [earthTex, specTex] = useLoader(TextureLoader, [
    '/textures/earth.jpg',
    '/textures/earth_specular.jpg',
  ])

  const uniforms = useMemo(() => ({
    earthTexture:    { value: earthTex },
    specularTexture: { value: specTex  },
    temperature:     { value: temperature },
  }), [earthTex, specTex])

  // Keep temperature uniform updated without re-creating material
  if (meshRef.current) {
    meshRef.current.material.uniforms.temperature.value = temperature
  }

  const handleClick = (e) => {
    e.stopPropagation()
    const p = e.point.clone().normalize()
    const lat = Math.asin(p.y) * (180 / Math.PI)
    const lon = Math.atan2(p.x, p.z) * (180 / Math.PI)
    onGlobeClick?.(lat, lon)
  }

  return (
    <mesh ref={meshRef} onClick={handleClick}>
      <sphereGeometry args={[2, 64, 64]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
      />
    </mesh>
  )
}
