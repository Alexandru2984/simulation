import { useRef } from 'react'
import * as THREE from 'three'

const vertexShader = `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mvPos.xyz);
    gl_Position = projectionMatrix * mvPos;
  }
`
const fragmentShader = `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  uniform float temperature;
  void main() {
    float fresnel = pow(1.0 - max(dot(vNormal, vViewDir), 0.0), 3.5);
    // Tint: cold = blue, hot = orange
    float t = clamp((temperature + 10.0) / 60.0, 0.0, 1.0);
    vec3 coldColor = vec3(0.2, 0.5, 1.0);
    vec3 hotColor  = vec3(1.0, 0.45, 0.1);
    vec3 color = mix(coldColor, hotColor, t);
    gl_FragColor = vec4(color, fresnel * 0.7);
  }
`

export default function Atmosphere({ temperature = 20 }) {
  const ref = useRef()
  return (
    <mesh ref={ref} scale={[1.06, 1.06, 1.06]}>
      <sphereGeometry args={[2, 64, 64]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={{ temperature: { value: temperature } }}
        side={THREE.FrontSide}
        blending={THREE.AdditiveBlending}
        transparent
        depthWrite={false}
      />
    </mesh>
  )
}
