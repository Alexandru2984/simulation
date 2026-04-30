import { Suspense, useRef, useEffect } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls, Stars } from '@react-three/drei'
import * as THREE from 'three'
import EarthGlobe from './EarthGlobe'
import CloudLayer from './CloudLayer'
import WindParticles from './WindParticles'
import Atmosphere from './Atmosphere'
import RainParticles from './RainParticles'
import GridOverlay from './GridOverlay'
import WindField from './WindField'
import StormLabels from './StormLabels'
import FrontalLayer from './FrontalLayer'

function latLonToVec3(lat, lon, r = 4.5) {
  const latRad = (lat * Math.PI) / 180
  const lonRad = ((lon + 180) * Math.PI) / 180
  return new THREE.Vector3(
    -r * Math.cos(latRad) * Math.cos(lonRad),
     r * Math.sin(latRad),
     r * Math.cos(latRad) * Math.sin(lonRad)
  )
}

function Scene({ weatherData, onGlobeClick, flyToLocation, gridData, overlayMode }) {
  const controlsRef  = useRef()
  const flyTargetRef = useRef(null)
  const { camera }   = useThree()

  useEffect(() => {
    if (!flyToLocation) return
    flyTargetRef.current = latLonToVec3(flyToLocation.lat, flyToLocation.lon, 4.5)
  }, [flyToLocation])

  useFrame(() => {
    if (!flyTargetRef.current || !controlsRef.current) return
    camera.position.lerp(flyTargetRef.current, 0.05)
    controlsRef.current.update()
    if (camera.position.distanceTo(flyTargetRef.current) < 0.08) {
      flyTargetRef.current = null
    }
  })

  const wd       = weatherData
  const temp     = wd?.temperature    ?? 20
  const wSpeed   = wd?.wind_speed     ?? 3
  const wDir     = wd?.wind_direction ?? 90
  const simTime  = gridData?.simTime  ?? 0

  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight position={[5, 3, 5]} intensity={1.3} />
      <Stars radius={100} depth={60} count={6000} factor={4} saturation={0} fade />

      <Suspense fallback={null}>
        <EarthGlobe temperature={temp} simTime={simTime} onGlobeClick={onGlobeClick} />
        <CloudLayer windDirection={wDir} windSpeed={wSpeed} gridData={gridData} />
      </Suspense>

      {/* Wind particles driven by grid data */}
      <WindParticles gridData={gridData} />
      <RainParticles gridData={gridData} />
      <Atmosphere temperature={temp} />

      {overlayMode && overlayMode !== 'wind' && overlayMode !== 'none' && (
        <GridOverlay gridData={gridData} mode={overlayMode} />
      )}
      {overlayMode === 'wind' && (
        <WindField gridData={gridData} />
      )}

      {/* Storm labels on globe */}
      {gridData?.storms?.length > 0 && (
        <StormLabels storms={gridData.storms} />
      )}

      {/* Frontal system markers */}
      {gridData?.fronts?.length > 0 && (
        <FrontalLayer fronts={gridData.fronts} />
      )}

      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.06}
        rotateSpeed={0.45}
        zoomSpeed={0.8}
        minDistance={2.5}
        maxDistance={9}
        enablePan={false}
      />
    </>
  )
}

export default function WeatherGlobe({ weatherData, onGlobeClick, flyToLocation, gridData, overlayMode }) {
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
        gridData={gridData}
        overlayMode={overlayMode}
      />
    </Canvas>
  )
}

