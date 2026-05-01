import { useRef, useMemo } from 'react'
import { useLoader, useFrame } from '@react-three/fiber'
import { TextureLoader } from 'three'
import * as THREE from 'three'

const vertexShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldNormal;
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vWorldNormal = normalize(normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const fragmentShader = `
  uniform sampler2D earthTexture;
  uniform sampler2D specularTexture;
  uniform float temperature;
  uniform vec3 sunDir;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorldNormal;

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
    float landMask = 1.0 - spec.r;
    vec3 color = mix(earth.rgb, earth.rgb * tint, landMask * 0.35);
    // Basic diffuse
    vec3 lightDir = normalize(vec3(1.0, 0.5, 1.0));
    float diff = max(dot(vNormal, lightDir), 0.1);
    color = color * diff;
    // Day/night cycle
    float cosZ = dot(vWorldNormal, normalize(sunDir));
    float nightBlend = 1.0 - pow(clamp(cosZ, 0.0, 1.0), 0.7);
    float dayFactor = 0.15 + 0.85 * (1.0 - nightBlend);
    color = color * dayFactor;
    gl_FragColor = vec4(color, 1.0);
  }
`

export default function EarthGlobe({ temperature = 20, simTime = 0, onGlobeClick, onGlobeHover }) {
  const meshRef = useRef()
  const simTimeRef = useRef(simTime)
  const tempRef = useRef(temperature)
  simTimeRef.current = simTime
  tempRef.current = temperature

  const [earthTex, specTex] = useLoader(TextureLoader, [
    '/textures/earth.jpg',
    '/textures/earth_specular.jpg',
  ])

  const uniforms = useMemo(() => ({
    earthTexture:    { value: earthTex },
    specularTexture: { value: specTex  },
    temperature:     { value: temperature },
    sunDir:          { value: new THREE.Vector3(1, 0, 0) },
  }), [earthTex, specTex]) // eslint-disable-line react-hooks/exhaustive-deps

  useFrame(() => {
    if (!meshRef.current) return
    const mat = meshRef.current.material
    mat.uniforms.temperature.value = tempRef.current

    // Real-time sun position from UTC wall clock — shows actual day/night on Earth
    const now = new Date()
    const utcSec = now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds()
    const startOfYear = Date.UTC(now.getUTCFullYear(), 0, 0)
    const dayOfYear   = Math.floor((now.getTime() - startOfYear) / 86400000)

    // Solar declination: ±23.44° over the year (peaks at solstices)
    const decl = 23.44 * (Math.PI / 180) * Math.sin((2 * Math.PI * (284 + dayOfYear)) / 365)

    // Hour angle: sun is over Greenwich (lon 0°) at UTC 12:00
    const hourAngle = ((utcSec / 86400) - 0.5) * 2 * Math.PI

    mat.uniforms.sunDir.value.set(
      Math.cos(decl) * Math.cos(-hourAngle),
      Math.sin(decl),
      Math.cos(decl) * Math.sin(-hourAngle)
    )
  })

  const handleClick = (e) => {
    e.stopPropagation()
    const p = e.point.clone().normalize()
    const lat = Math.asin(p.y) * (180 / Math.PI)
    const lon = Math.atan2(p.z, -p.x) * (180 / Math.PI) - 180
    onGlobeClick?.(lat, lon)
  }

  const handleHover = (e) => {
    e.stopPropagation()
    const p = e.point.clone().normalize()
    const lat = Math.asin(p.y) * (180 / Math.PI)
    const lon = Math.atan2(p.z, -p.x) * (180 / Math.PI) - 180
    onGlobeHover?.({ lat, lon, clientX: e.clientX, clientY: e.clientY })
  }

  return (
    <mesh ref={meshRef} onClick={handleClick} onPointerMove={handleHover} onPointerLeave={() => onGlobeHover?.(null)}>
      <sphereGeometry args={[2, 64, 64]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
      />
    </mesh>
  )
}
