import { Suspense, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
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
import CountryBorders from './CountryBorders'
import IsobarLines from './IsobarLines'
import LightningEffect from './LightningEffect'
import GlobeLabel, { LabelProjector } from './GlobeLabel'
import { latLonToVec3, sampleGrid, vec3ToLatLon } from '../utils/geoUtils'
import {
  compassPoint, formatLatLon, formatNumber, formatPercent, formatPressure, formatTemperature, formatWind,
  windFromComponents,
} from '../utils/units'
import { t as translateNow } from '../i18n/i18n.js'
import { useI18n } from '../i18n/react'

const MIN_DISTANCE = 2.6
const MAX_DISTANCE = 9
const FOCUS_DISTANCE = 4.2
const HOME_DISTANCE = 4.8
const IDLE_BEFORE_ROTATE_MS = 12_000
const TOUR_INTERVAL_MS = 8_000

// Quality presets: device pixel ratio, particle caps and star count.
function qualityProfile(quality, layout) {
  if (quality === 'low') return { dpr: [1, 1], particles: 1024, stars: 1500, antialias: false }
  if (quality === 'high') return { dpr: [1, 2], particles: 8192, stars: 7000, antialias: true }
  return layout === 'mobile'
    ? { dpr: [1, 1.5], particles: 2048, stars: 2500, antialias: true }
    : { dpr: [1, 2], particles: 8192, stars: 6000, antialias: true }
}

// Camera distance at which the whole globe (plus atmosphere) fits the
// narrower screen axis. Portrait phones get a wider lens and a longer throw.
function fitCamera(aspect) {
  const fov = aspect < 0.8 ? 60 : 50
  const halfV = (fov / 2) * Math.PI / 180
  const halfNarrow = aspect < 1 ? Math.atan(Math.tan(halfV) * aspect) : halfV
  const distance = THREE.MathUtils.clamp(2.35 / Math.sin(halfNarrow), HOME_DISTANCE, 9.5)
  return { fov, distance }
}

function toVector(lat, lon, distance) {
  const p = latLonToVec3(lat, lon, distance)
  return new THREE.Vector3(p.x, p.y, p.z)
}

function timestampForFile() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

// Rendered after the textures inside the same Suspense boundary, so it
// mounts only once the Earth is actually drawable.
function ReadySignal({ onReady }) {
  useEffect(() => { onReady?.() }, [onReady])
  return null
}

function CityPin({ registry, location }) {
  if (!location) return null
  return (
    <GlobeLabel registry={registry} id="city-pin" lat={location.lat} lon={location.lon} altitude={0.08} className="city-pin">
      <span className="city-pin__dot" />
      {location.name && <span className="city-pin__name">{location.name}</span>}
    </GlobeLabel>
  )
}

function Scene({
  apiRef, weatherData, gridData, previewData, overlayMode, flyTo, onGlobeClick, labels,
  onGlobeHover, onViewChange, onReady, profile, autoRotate, reducedMotion, tourActive,
}) {
  const { camera, gl, scene, size } = useThree()
  const controlsRef = useRef()
  const homeDistanceRef = useRef(HOME_DISTANCE)
  const fittedRef = useRef(false)
  const flyTargetRef = useRef(null)
  const lastInteractionRef = useRef(0)
  const stormsRef = useRef(gridData?.storms)
  const scratch = useMemo(() => ({
    from: new THREE.Vector3(), to: new THREE.Vector3(),
    q: new THREE.Quaternion(), step: new THREE.Quaternion(),
  }), [])

  useEffect(() => { stormsRef.current = gridData?.storms }, [gridData?.storms])

  // Lens follows the viewport; the starting distance is fitted only once so
  // later resizes never undo the user's own zoom.
  const fit = useMemo(() => fitCamera(size.width / Math.max(1, size.height)), [size.width, size.height])
  const maxDistance = Math.max(MAX_DISTANCE, fit.distance + 1)

  useEffect(() => {
    const { fov, distance } = fit
    homeDistanceRef.current = distance
    if (camera.fov !== fov) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
    if (!fittedRef.current) {
      fittedRef.current = true
      camera.position.setLength(Math.max(camera.position.length(), distance))
    }
  }, [camera, fit])

  const flyToPoint = useCallback((lat, lon, distance) => {
    const d = distance ?? Math.max(FOCUS_DISTANCE, homeDistanceRef.current * 0.85)
    flyTargetRef.current = toVector(lat, lon, d)
  }, [])

  const reportView = useCallback(() => {
    const p = camera.position
    onViewChange?.(vec3ToLatLon(p.x, p.y, p.z))
  }, [camera, onViewChange])

  useImperativeHandle(apiRef, () => ({
    zoom(direction) {
      const base = flyTargetRef.current ?? camera.position
      const length = THREE.MathUtils.clamp(base.length() * (direction < 0 ? 0.8 : 1.25), MIN_DISTANCE, Math.max(MAX_DISTANCE, homeDistanceRef.current + 1))
      flyTargetRef.current = base.clone().setLength(length)
    },
    reset() {
      const { lon } = vec3ToLatLon(camera.position.x, camera.position.y, camera.position.z)
      flyTargetRef.current = toVector(20, lon, homeDistanceRef.current)
    },
    focus: flyToPoint,
    // Renders a fresh frame and reads it back immediately, so the canvas does
    // not need preserveDrawingBuffer (which costs performance every frame).
    screenshot() {
      try {
        gl.render(scene, camera)
        const link = document.createElement('a')
        link.href = gl.domElement.toDataURL('image/png')
        link.download = `weather-simulation-${timestampForFile()}.png`
        link.click()
        return true
      } catch {
        return false
      }
    },
  }), [camera, gl, scene, flyToPoint])

  useEffect(() => {
    if (flyTo) flyToPoint(flyTo.lat, flyTo.lon, flyTo.distance)
  }, [flyTo, flyToPoint])

  // Storm tour: the interval only restarts when the tour is toggled, so a new
  // grid frame every second no longer resets it back to the first storm.
  useEffect(() => {
    if (!tourActive) return undefined
    let index = 0
    const visit = () => {
      const storms = stormsRef.current
      if (!storms?.length) return
      const sorted = [...storms].sort((a, b) => (a.anom ?? 0) - (b.anom ?? 0))
      const storm = sorted[index % sorted.length]
      index += 1
      flyToPoint(storm.lat, storm.lon)
    }
    visit()
    const timer = setInterval(visit, TOUR_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [tourActive, flyToPoint])

  useFrame((_, delta) => {
    const controls = controlsRef.current
    const target = flyTargetRef.current
    if (controls) {
      const idle = performance.now() - lastInteractionRef.current > IDLE_BEFORE_ROTATE_MS
      controls.autoRotate = autoRotate && !reducedMotion && !tourActive && !target && idle
    }
    if (!target) return

    // Fly along the sphere (slerp of the direction, lerp of the distance) so
    // the camera never cuts through the globe on the way to the far side.
    const k = reducedMotion ? 1 : 1 - Math.exp(-delta * 4.5)
    const { from, to, q, step } = scratch
    const length = camera.position.length()
    from.copy(camera.position).normalize()
    to.copy(target).normalize()
    q.setFromUnitVectors(from, to)
    step.identity().slerp(q, k)
    from.applyQuaternion(step)
    camera.position.copy(from).multiplyScalar(THREE.MathUtils.lerp(length, target.length(), k))
    camera.lookAt(0, 0, 0)

    if (camera.position.distanceTo(target) < 0.01) {
      camera.position.copy(target)
      camera.lookAt(0, 0, 0)
      flyTargetRef.current = null
      controls?.update()
      reportView()
    }
  })

  const displayData = previewData ?? gridData
  const effectiveMode = (() => {
    if (!previewData) return overlayMode
    if (overlayMode === 'storm' && !previewData.SP) return 'temp'
    if (overlayMode === 'humidity' && !previewData.H) return 'temp'
    if (overlayMode === 'precip' && !previewData.R) return 'temp'
    return overlayMode
  })()

  const temp = weatherData?.temperature ?? 20
  const simTime = gridData?.simTime ?? 0
  const animated = !reducedMotion

  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight position={[5, 3, 5]} intensity={1.3} />
      <Stars radius={100} depth={60} count={profile.stars} factor={4} saturation={0} fade speed={animated ? 1 : 0} />

      <Suspense fallback={null}>
        <EarthGlobe temperature={temp} simTime={simTime} onGlobeClick={onGlobeClick} onGlobeHover={onGlobeHover} />
        <CloudLayer gridData={gridData} animate={animated} />
        <ReadySignal onReady={onReady} />
      </Suspense>

      <CountryBorders />

      {animated && <WindParticles gridData={gridData} maxParticles={profile.particles} />}
      {animated && <RainParticles gridData={gridData} maxParticles={profile.particles} />}
      <Atmosphere temperature={temp} />

      {effectiveMode !== 'wind' && effectiveMode !== 'none' && (
        <GridOverlay gridData={displayData} mode={effectiveMode} />
      )}
      {overlayMode === 'wind' && <WindField gridData={displayData} />}

      <IsobarLines gridData={displayData} active={overlayMode === 'pressure'} />

      {gridData?.fronts?.length > 0 && <FrontalLayer fronts={gridData.fronts} />}
      {animated && <LightningEffect storms={gridData?.storms} />}

      <LabelProjector registry={labels} />

      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.06}
        rotateSpeed={0.45}
        zoomSpeed={0.8}
        minDistance={MIN_DISTANCE}
        maxDistance={maxDistance}
        enablePan={false}
        autoRotateSpeed={0.35}
        onStart={() => {
          lastInteractionRef.current = performance.now()
          flyTargetRef.current = null
        }}
        onEnd={() => {
          lastInteractionRef.current = performance.now()
          reportView()
        }}
      />
    </>
  )
}

// Tooltip rows are rebuilt with DOM APIs and textContent only.
function fillTooltip(el, rows, coords) {
  const head = document.createElement('div')
  head.className = 'globe-tooltip__coords'
  head.textContent = coords
  const list = document.createElement('dl')
  list.className = 'globe-tooltip__grid'
  for (const [label, value, color] of rows) {
    const dt = document.createElement('dt')
    dt.textContent = label
    const dd = document.createElement('dd')
    dd.textContent = value
    dd.style.color = color
    list.append(dt, dd)
  }
  el.replaceChildren(head, list)
}

export default function WeatherGlobe({
  apiRef, weatherData, gridData, previewData, overlayMode, flyTo, selected, onGlobeClick,
  onViewChange, onReady, initialView, quality = 'auto', layout = 'desktop', autoRotate = true,
  reducedMotion = false, tourActive = false, prefs,
}) {
  const { t } = useI18n()
  const tooltipRef = useRef(null)
  const gridRef = useRef(null)
  const prefsRef = useRef(prefs)
  const pendingRef = useRef(null)
  const frameRef = useRef(0)
  // id → { el, pos } for the DOM labels the projector moves each frame.
  const [labels] = useState(() => new Map())
  const profile = qualityProfile(quality, layout)
  const [initialCamera] = useState(() => {
    const p = latLonToVec3(initialView?.lat ?? 25, initialView?.lon ?? 15, HOME_DISTANCE)
    return [p.x, p.y, p.z]
  })

  useEffect(() => { gridRef.current = previewData ?? gridData }, [gridData, previewData])
  useEffect(() => { prefsRef.current = prefs }, [prefs])
  useEffect(() => () => cancelAnimationFrame(frameRef.current), [])

  const renderTooltip = useCallback(() => {
    frameRef.current = 0
    const el = tooltipRef.current
    const info = pendingRef.current
    if (!el) return
    if (!info) {
      el.style.display = 'none'
      return
    }
    const { lat, lon, clientX, clientY } = info
    const g = gridRef.current
    const p = prefsRef.current ?? {}
    const sample = arr => (arr ? sampleGrid(lat, lon, arr, g.rows, g.cols) : null)
    const T = sample(g?.T)
    const P = sample(g?.P)
    const H = sample(g?.H)
    const R = sample(g?.R)
    const wind = windFromComponents(sample(g?.U) ?? 0, sample(g?.V) ?? 0)

    // Runs outside render, so it reads the active language directly.
    const tr = translateNow
    const windText = g?.U
      ? tr('tooltip.windFrom', { speed: formatWind(wind.speed, p.windUnit), direction: compassPoint(wind.fromDegrees) })
      : '—'
    fillTooltip(el, [
      [tr('quantity.temperature'), formatTemperature(T, p.tempUnit), '#f97316'],
      [tr('quantity.pressure'), formatPressure(P, 1), '#60a5fa'],
      [tr('quantity.wind'), windText, '#38bdf8'],
      [tr('quantity.humidity'), formatPercent(H), '#34d399'],
      [tr('quantity.precipitation'), Number.isFinite(R) ? `${formatNumber(Math.max(0, R), 1)} mm/h` : '—', '#818cf8'],
    ], formatLatLon(lat, lon, 1))

    el.style.display = 'block'
    const { width, height } = el.getBoundingClientRect()
    const left = clientX + 16 + width > window.innerWidth ? clientX - width - 12 : clientX + 16
    const top = clientY + 16 + height > window.innerHeight ? clientY - height - 8 : clientY + 16
    el.style.transform = `translate(${Math.max(4, left)}px, ${Math.max(4, top)}px)`
  }, [])

  // Pointer moves are coalesced to one tooltip update per animation frame.
  const handleGlobeHover = useCallback(info => {
    pendingRef.current = info
    if (!frameRef.current) frameRef.current = requestAnimationFrame(renderTooltip)
  }, [renderTooltip])

  const handleClick = useCallback((lat, lon) => {
    pendingRef.current = null
    if (tooltipRef.current) tooltipRef.current.style.display = 'none'
    onGlobeClick?.(lat, lon)
  }, [onGlobeClick])

  return (
    <>
      <div ref={tooltipRef} className="globe-tooltip" role="presentation" />
      <Canvas
        key={profile.antialias ? 'aa' : 'no-aa'}
        className="globe-canvas"
        camera={{ position: initialCamera, fov: 50, near: 0.1, far: 400 }}
        dpr={profile.dpr}
        gl={{ antialias: profile.antialias, alpha: false, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => gl.setClearColor('#030711')}
        role="region"
        aria-label={t('globe.description')}
      >
        <Scene
          apiRef={apiRef}
          weatherData={weatherData}
          gridData={gridData}
          previewData={previewData}
          overlayMode={overlayMode}
          flyTo={flyTo}
          labels={labels}
          onGlobeClick={handleClick}
          onGlobeHover={handleGlobeHover}
          onViewChange={onViewChange}
          onReady={onReady}
          profile={profile}
          autoRotate={autoRotate}
          reducedMotion={reducedMotion}
          tourActive={tourActive}
        />
      </Canvas>
      <div className="globe-labels" aria-hidden="true">
        <StormLabels registry={labels} storms={gridData?.storms} windUnit={prefs?.windUnit} />
        <CityPin registry={labels} location={selected} />
      </div>
    </>
  )
}
