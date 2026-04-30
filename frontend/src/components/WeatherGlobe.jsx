import { Suspense, useRef, useEffect, useState } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls, Stars, Html } from '@react-three/drei'
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

// Glowing pin shown at the searched city's location
function CityPin({ location, name }) {
  if (!location) return null
  const pos = latLonToVec3(location.lat, location.lon, 2.08)
  return (
    <Html
      position={[pos.x, pos.y, pos.z]}
      distanceFactor={5}
      occlude
      style={{ pointerEvents: 'none' }}
    >
      <div style={{ textAlign: 'center', transform: 'translateX(-50%)' }}>
        <div style={{
          width: 10, height: 10, borderRadius: '50%',
          background: '#38bdf8',
          boxShadow: '0 0 6px #38bdf8, 0 0 14px #38bdf888',
          margin: '0 auto',
          animation: 'pinPulse 1.8s ease-in-out infinite',
        }} />
        {name && (
          <div style={{
            color: '#e2e8f0', fontSize: '0.68rem', fontWeight: 600,
            background: 'rgba(3,7,17,0.82)',
            borderRadius: 5, padding: '2px 7px',
            marginTop: 4, whiteSpace: 'nowrap',
            border: '1px solid rgba(56,189,248,0.35)',
            backdropFilter: 'blur(6px)',
          }}>
            {name}
          </div>
        )}
      </div>
    </Html>
  )
}

function Scene({ weatherData, onGlobeClick, flyToLocation, gridData, overlayMode, previewData, selectedCity }) {
  const controlsRef  = useRef()
  const flyTargetRef = useRef(null)
  const { camera }   = useThree()
  // Incrementing this key remounts OrbitControls fresh — clears damping velocity after fly
  const [controlsKey, setControlsKey] = useState(0)

  useEffect(() => {
    if (!flyToLocation) return
    // Stay at comfortable viewing distance (4.2) regardless of current zoom
    flyTargetRef.current = latLonToVec3(flyToLocation.lat, flyToLocation.lon, 4.2)
    // Disable controls so they don't fight the lerp animation
    if (controlsRef.current) controlsRef.current.enabled = false
  }, [flyToLocation])

  useFrame(() => {
    if (!flyTargetRef.current) return
    camera.position.lerp(flyTargetRef.current, 0.07)
    camera.lookAt(0, 0, 0)
    if (camera.position.distanceTo(flyTargetRef.current) < 0.04) {
      camera.position.copy(flyTargetRef.current)
      camera.lookAt(0, 0, 0)
      flyTargetRef.current = null
      // Remount OrbitControls to get a clean state (no stale damping velocity)
      setControlsKey(k => k + 1)
    }
  })

  const displayData  = previewData ?? gridData
  const effectiveMode = (() => {
    if (!previewData) return overlayMode
    if (overlayMode === 'storm'    && !previewData.SP) return 'temp'
    if (overlayMode === 'humidity' && !previewData.H)  return 'temp'
    if (overlayMode === 'precip'   && !previewData.R)  return 'temp'
    return overlayMode
  })()

  const wd      = weatherData
  const temp    = wd?.temperature    ?? 20
  const wSpeed  = wd?.wind_speed     ?? 3
  const wDir    = wd?.wind_direction ?? 90
  const simTime = gridData?.simTime  ?? 0

  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight position={[5, 3, 5]} intensity={1.3} />
      <Stars radius={100} depth={60} count={6000} factor={4} saturation={0} fade />

      <Suspense fallback={null}>
        <EarthGlobe temperature={temp} simTime={simTime} onGlobeClick={onGlobeClick} />
        <CloudLayer windDirection={wDir} windSpeed={wSpeed} gridData={gridData} />
      </Suspense>

      <WindParticles gridData={gridData} />
      <RainParticles gridData={gridData} />
      <Atmosphere temperature={temp} />

      {effectiveMode && effectiveMode !== 'wind' && effectiveMode !== 'none' && (
        <GridOverlay gridData={displayData} mode={effectiveMode} />
      )}
      {overlayMode === 'wind' && (
        <WindField gridData={displayData} />
      )}

      {gridData?.storms?.length > 0 && (
        <StormLabels storms={gridData.storms} />
      )}
      {gridData?.fronts?.length > 0 && (
        <FrontalLayer fronts={gridData.fronts} />
      )}

      <CityPin location={selectedCity} name={selectedCity?.name} />

      <OrbitControls
        key={controlsKey}
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

export default function WeatherGlobe({ weatherData, onGlobeClick, flyToLocation, gridData, overlayMode, previewData, selectedCity }) {
  return (
    <>
      <style>{`
        @keyframes pinPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.6; transform: scale(1.4); }
        }
      `}</style>
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
          previewData={previewData}
          selectedCity={selectedCity}
        />
      </Canvas>
    </>
  )
}

