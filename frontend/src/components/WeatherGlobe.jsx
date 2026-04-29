import { Suspense, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Stars } from '@react-three/drei'
import EarthGlobe from './EarthGlobe'
import CloudLayer from './CloudLayer'
import WindParticles from './WindParticles'
import Atmosphere from './Atmosphere'
import RainParticles from './RainParticles'

function Scene({ weatherData, onGlobeClick }) {
  const wd = weatherData
  const temp     = wd?.temperature    ?? 20
  const pressure = wd?.pressure       ?? 1013
  const wSpeed   = wd?.wind_speed     ?? 3
  const wDir     = wd?.wind_direction ?? 90
  const isRain   = pressure < 1010

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 3, 5]} intensity={1.2} />
      <Stars radius={100} depth={60} count={6000} factor={4} saturation={0} fade />

      <Suspense fallback={null}>
        <EarthGlobe temperature={temp} onGlobeClick={onGlobeClick} />
        <CloudLayer windDirection={wDir} windSpeed={wSpeed} />
      </Suspense>

      <WindParticles windDirection={wDir} windSpeed={wSpeed} />
      <RainParticles pressure={pressure} active={isRain} />
      <Atmosphere temperature={temp} />

      <OrbitControls
        enablePan={false}
        minDistance={2.5}
        maxDistance={8}
        autoRotate={false}
        rotateSpeed={0.5}
        zoomSpeed={0.8}
      />
    </>
  )
}

export default function WeatherGlobe({ weatherData, onGlobeClick }) {
  return (
    <Canvas
      camera={{ position: [0, 0, 4.5], fov: 50 }}
      style={{ background: '#030711' }}
      gl={{ antialias: true, alpha: false }}
    >
      <Scene weatherData={weatherData} onGlobeClick={onGlobeClick} />
    </Canvas>
  )
}
