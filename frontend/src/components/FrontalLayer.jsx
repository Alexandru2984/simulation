import { useMemo } from 'react'
import * as THREE from 'three'

const SPHERE_R = 2.05

const vertexShader = `
  attribute float aIntensity;
  varying float vIntensity;
  void main() {
    vIntensity = aIntensity;
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = 6.0 + aIntensity * 12.0;
    gl_Position = projectionMatrix * mvPos;
  }
`
const fragmentShader = `
  varying float vIntensity;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    if (length(c) > 0.5) discard;
    // blue → purple → red gradient
    vec3 blue   = vec3(0.0, 0.4, 1.0);
    vec3 purple = vec3(0.7, 0.0, 1.0);
    vec3 red    = vec3(1.0, 0.1, 0.0);
    vec3 color;
    if (vIntensity < 0.5) {
      color = mix(blue, purple, vIntensity * 2.0);
    } else {
      color = mix(purple, red, (vIntensity - 0.5) * 2.0);
    }
    float alpha = 0.2 + vIntensity * 0.6;
    float edge = 1.0 - length(c) * 1.8;
    gl_FragColor = vec4(color, alpha * max(edge, 0.0));
  }
`

export default function FrontalLayer({ fronts }) {
  const { geometry, material } = useMemo(() => {
    if (!fronts || fronts.length === 0) return { geometry: null, material: null }

    const pos       = new Float32Array(fronts.length * 3)
    const intensity = new Float32Array(fronts.length)

    fronts.forEach(({ lat, lon, frontIntensity }, i) => {
      const latR = (lat ?? 0) * Math.PI / 180
      const lonR = ((lon ?? 0) + 180) * Math.PI / 180
      pos[i*3]   = -SPHERE_R * Math.cos(latR) * Math.cos(lonR)
      pos[i*3+1] =  SPHERE_R * Math.sin(latR)
      pos[i*3+2] =  SPHERE_R * Math.cos(latR) * Math.sin(lonR)
      intensity[i] = Math.max(0, Math.min(1, frontIntensity ?? 0))
    })

    const g = new THREE.BufferGeometry()
    g.setAttribute('position',   new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aIntensity', new THREE.BufferAttribute(intensity, 1))

    const m = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })

    return { geometry: g, material: m }
  }, [fronts])

  if (!geometry || !material) return null

  return <points geometry={geometry} material={material} />
}
