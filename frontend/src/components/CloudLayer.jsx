import { useRef } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { TextureLoader } from 'three'

export default function CloudLayer({ windDirection = 0, windSpeed = 3 }) {
  const meshRef = useRef()
  const cloudTex = useLoader(TextureLoader, '/textures/clouds.png')

  useFrame((_, delta) => {
    if (!meshRef.current) return
    const speed = (windSpeed / 20) * delta * 0.12
    meshRef.current.rotation.y += Math.cos(windDirection * Math.PI / 180) * speed
    meshRef.current.rotation.x += Math.sin(windDirection * Math.PI / 180) * speed * 0.1
  })

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[2.04, 48, 48]} />
      <meshPhongMaterial
        map={cloudTex}
        transparent
        opacity={0.38}
        depthWrite={false}
      />
    </mesh>
  )
}
