import { Suspense, useRef, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { CameraControls, Stars } from '@react-three/drei'
import * as THREE from 'three'
import EarthGlobe from './EarthGlobe'
import CloudLayer from './CloudLayer'
import WindParticles from './WindParticles'
import Atmosphere from './Atmosphere'
import RainParticles from './RainParticles'

// lat/lon → 3D camera position for Three.js SphereGeometry
// Three.js maps lon=0° → +X, lon=90°E → -Z, matching standard equirectangular textures.
// Formula derived from SphereGeometry UV→vertex math: u=(lon+180)/360, v=(lat+90)/180
function latLonToVec3(lat, lon, r = 4.5) {
  const latRad = (lat * Math.PI) / 180
  const lonRad = ((lon + 180) * Math.PI) / 180
  return new THREE.Vector3(
    -r * Math.cos(latRad) * Math.cos(lonRad),
     r * Math.sin(latRad),
     r * Math.cos(latRad) * Math.sin(lonRad)
  )
}

function Scene({ weatherData, onGlobeClick, flyToLocation }) {
  const controlsRef = useRef()

  // Fly camera to location whenever flyToLocation changes
  useEffect(() => {
    if (!flyToLocation || !controlsRef.current) return
    const { lat, lon } = flyToLocation
    const target = latLonToVec3(lat, lon, 4.2)
    controlsRef.current.setLookAt(
      target.x, target.y, target.z,
      0, 0, 0,
      true // smooth animation
    )
  }, [flyToLocation])

  const wd      = weatherData
  const temp    = wd?.temperature    ?? 20
  const pressure= wd?.pressure       ?? 1013
  const wSpeed  = wd?.wind_speed     ?? 3
  const wDir    = wd?.wind_direction ?? 90
  const isRain  = pressure < 1010

  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight position={[5, 3, 5]} intensity={1.3} />
      <Stars radius={100} depth={60} count={6000} factor={4} saturation={0} fade />

      <Suspense fallback={null}>
        <EarthGlobe temperature={temp} onGlobeClick={onGlobeClick} />
        <CloudLayer windDirection={wDir} windSpeed={wSpeed} />
      </Suspense>

      <WindParticles windDirection={wDir} windSpeed={wSpeed} />
      <RainParticles pressure={pressure} active={isRain} />
      <Atmosphere temperature={temp} />

      <CameraControls
        ref={controlsRef}
        minDistance={2.5}
        maxDistance={9}
        polarRotateSpeed={0.5}
        azimuthRotateSpeed={0.5}
        smoothTime={0.25}
        draggingSmoothTime={0.1}
      />
    </>
  )
}

export default function WeatherGlobe({ weatherData, onGlobeClick, flyToLocation }) {
  return (
    <Canvas
      camera={{ position: [0, 1.5, 4.5], fov: 50 }}
      style={{ background: '#030711' }}
      gl={{ antialias: true, alpha: false }}
    >
      <Scene
        weatherData={weatherData}
        onGlobeClick={onGlobeClick}
        flyToLocation={flyToLocation}
      />
    </Canvas>
  )
}
