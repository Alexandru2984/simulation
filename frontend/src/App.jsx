import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useWeatherSocket } from './hooks/useWeatherSocket'
import { useGridSocket } from './hooks/useGridSocket'
import { combineSocketStatuses } from './hooks/webSocketManager'
import { useLayout, useReducedMotion } from './hooks/useMediaQuery'
import { usePreferences } from './hooks/usePreferences'
import { useToasts } from './hooks/useToasts'
import { useFullscreen } from './hooks/useFullscreen'
import { postJson } from './utils/api'
import { buildViewHash, parseViewHash } from './utils/viewState'
import { formatLatLon } from './utils/units'
import { hasWebGL } from './utils/webgl'
import { EVENT_BY_ID, LAYERS } from './constants'
import ErrorBoundary from './components/ErrorBoundary'
import Splash from './components/Splash'
import WeatherHUD from './components/WeatherHUD'
import MobileHUD from './components/MobileHUD'
import EventPanel from './components/EventPanel'
import SimStats from './components/SimStats'
import ForecastPanel from './components/ForecastPanel'
import Legend from './components/Legend'

// three.js and the globe are the heavy part; the HUD renders immediately.
const WeatherGlobe = lazy(() => import('./components/WeatherGlobe'))
const WeatherPopup = lazy(() => import('./components/WeatherPopup'))
const HelpDialog = lazy(() => import('./components/HelpDialog'))
const SettingsDialog = lazy(() => import('./components/SettingsDialog'))

const SPLASH_TIMEOUT_MS = 15_000

function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

// First view: the shared link if there is one, else roughly the visitor's
// own longitude (from the time-zone offset) so they start above home.
function initialView(hashView) {
  if (Number.isFinite(hashView.lat)) return { lat: hashView.lat, lon: hashView.lon }
  const lon = Math.max(-170, Math.min(170, -new Date().getTimezoneOffset() / 4))
  return { lat: 25, lon }
}

function GlobeFallback({ title, message, action }) {
  return (
    <div className="globe-fallback">
      <div className="globe-fallback__card glass">
        <div className="splash__orb" aria-hidden="true" />
        <h2>{title}</h2>
        <p>{message}</p>
        {action}
      </div>
    </div>
  )
}

export default function App() {
  const { data: weatherData, status: weatherStatus } = useWeatherSocket()
  const { data: gridData, status: gridStatus } = useGridSocket()
  const status = combineSocketStatuses(weatherStatus, gridStatus)
  const layout = useLayout()
  const isMobile = layout === 'mobile'
  const reducedMotion = useReducedMotion()
  const [prefs, updatePrefs] = usePreferences()
  const { toasts, notify } = useToasts()
  const fullscreen = useFullscreen()

  const [hashView] = useState(() => parseViewHash(window.location.hash))
  const [startView] = useState(() => initialView(hashView))
  const [webgl] = useState(hasWebGL)

  const [overlayMode, setOverlayMode] = useState(hashView.layer ?? 'temp')
  const [view, setView] = useState(startView)
  const [flyTo, setFlyTo] = useState(null)
  const [selected, setSelected] = useState(null)
  const [popup, setPopup] = useState(null)
  const [placementMode, setPlacementMode] = useState(null)
  const [intensity, setIntensity] = useState(1)
  const [previewSnap, setPreviewSnap] = useState(null)
  const [eventPanelOpen, setEventPanelOpen] = useState(() => window.innerWidth >= 1200)
  const [timeOpen, setTimeOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [dialog, setDialog] = useState(null)
  const [tourActive, setTourActive] = useState(false)
  const [locations, setLocations] = useState([])
  const [activeCity, setActiveCity] = useState(null)
  const [seeding, setSeeding] = useState(false)
  const [pendingSpeed, setPendingSpeed] = useState(null)
  const [globeReady, setGlobeReady] = useState(false)
  const [splashTimedOut, setSplashTimedOut] = useState(false)

  const globeApi = useRef(null)
  const searchRef = useRef(null)
  const speedTimer = useRef(null)

  const storms = gridData?.storms?.length ?? 0
  const speed = pendingSpeed ?? gridData?.speed ?? 1

  // ── Data ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/weather/locations', { signal: controller.signal })
      .then(res => (res.ok ? res.json() : null))
      .then(d => { if (Array.isArray(d?.locations)) setLocations(d.locations) })
      .catch(() => {})
    return () => controller.abort()
  }, [])

  useEffect(() => () => clearTimeout(speedTimer.current), [])
  useEffect(() => { if (storms === 0) setTourActive(false) }, [storms])

  useEffect(() => {
    const timer = setTimeout(() => setSplashTimedOut(true), SPLASH_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [])

  // ── Shareable URL (#lat=..&lon=..&layer=..) ────────────────────────────
  useEffect(() => {
    const hash = buildViewHash({ ...view, layer: overlayMode })
    if (hash !== window.location.hash) {
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}${hash}`)
    }
  }, [view, overlayMode])

  useEffect(() => {
    const onHash = () => {
      const next = parseViewHash(window.location.hash)
      if (next.layer) setOverlayMode(next.layer)
      if (Number.isFinite(next.lat)) setFlyTo({ lat: next.lat, lon: next.lon })
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // ── Actions ─────────────────────────────────────────────────────────────
  const focusOn = useCallback((lat, lon) => setFlyTo({ lat, lon }), [])

  const injectAt = useCallback(async (type, lat, lon) => {
    const meta = EVENT_BY_ID[type]
    if (!meta) return
    const res = await postJson('/api/grid/inject', { type, lat, lon, intensity })
    if (res.ok) {
      notify(`${meta.icon} ${meta.label} injected at ${formatLatLon(lat, lon, 1)}`, 'event')
      setFlyTo({ lat, lon })
    } else if (!res.aborted) {
      notify(`Could not inject ${meta.label.toLowerCase()}: ${res.error}`, 'error')
    }
  }, [intensity, notify])

  const handleSeed = useCallback(async (lat, lon, name) => {
    setFlyTo({ lat, lon })
    setSelected({ lat, lon, name })
    setActiveCity(name ?? null)
    setSeeding(true)
    const res = await postJson('/api/weather/seed', { lat, lon })
    setSeeding(false)
    if (!res.ok && !res.aborted) notify(`Live weather unavailable: ${res.error}`, 'warning')
  }, [notify])

  const handleSearchSelect = useCallback((lat, lon, name) => {
    handleSeed(lat, lon, name)
    setPopup({ lat, lon })
  }, [handleSeed])

  const handleGlobeClick = useCallback((lat, lon) => {
    if (placementMode) {
      injectAt(placementMode, lat, lon)
      setPlacementMode(null)
      return
    }
    setFlyTo({ lat, lon })
    setSelected(null)
    setPopup({ lat, lon })
  }, [placementMode, injectAt])

  const handleSpeedChange = useCallback(async value => {
    clearTimeout(speedTimer.current)
    setPendingSpeed(value)
    const res = await postJson('/api/weather/speed', { value })
    if (!res.ok) {
      setPendingSpeed(null)
      if (!res.aborted) notify(`Speed unchanged: ${res.error}`, 'error')
      return
    }
    // Hold the optimistic value until the next grid frame carries it.
    speedTimer.current = setTimeout(() => setPendingSpeed(null), 1500)
  }, [notify])

  const startPlacement = useCallback(type => {
    setPlacementMode(type)
    if (type) {
      setPopup(null)
      setSheetOpen(false)
    }
  }, [])

  const toggleTour = useCallback(() => setTourActive(active => !active && storms > 0), [storms])
  const goLive = useCallback(() => setPreviewSnap(null), [])
  const closePopup = useCallback(() => setPopup(null), [])
  const closeDialog = useCallback(() => setDialog(null), [])
  const handleGlobeReady = useCallback(() => setGlobeReady(true), [])

  const share = useCallback(async () => {
    const url = `${window.location.origin}${window.location.pathname}${buildViewHash({ ...view, layer: overlayMode })}`
    if (navigator.share && isMobile) {
      try {
        await navigator.share({ title: document.title, text: 'Live weather simulation', url })
        return
      } catch (err) {
        if (err?.name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      notify('🔗 Link to this view copied', 'info')
    } catch {
      window.prompt('Copy this link', url)
    }
  }, [view, overlayMode, isMobile, notify])

  const screenshot = useCallback(() => {
    if (!globeApi.current?.screenshot()) notify('Screenshot is not available yet', 'warning')
  }, [notify])

  // ── Keyboard shortcuts ─────────────────────────────────────────────────
  const keyActions = useRef(null)
  keyActions.current = {
    layer: key => {
      const layer = LAYERS.find(l => l.key === key)
      if (layer) setOverlayMode(layer.id)
    },
    search: () => (isMobile ? setSearchOpen(true) : searchRef.current?.focus()),
    events: () => (isMobile ? setSheetOpen(open => !open) : setEventPanelOpen(open => !open)),
    tour: toggleTour,
    zoom: dir => globeApi.current?.zoom(dir),
    reset: () => globeApi.current?.reset(),
    fullscreen: fullscreen.toggle,
    screenshot,
    live: goLive,
    help: () => setDialog('help'),
    escape: () => {
      if (popup) return // the popup closes itself
      if (placementMode) setPlacementMode(null)
      else if (searchOpen) setSearchOpen(false)
      else if (sheetOpen) setSheetOpen(false)
      else if (timeOpen) setTimeOpen(false)
      else if (tourActive) setTourActive(false)
    },
  }

  useEffect(() => {
    const onKey = e => {
      const a = keyActions.current
      if (e.key === 'Escape') { a.escape(); return }
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return
      if (document.querySelector('.dialog')) return
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
      const handled = (() => {
        if (key >= '1' && key <= '7') {
          a.layer(key)
          return true
        }
        switch (key) {
          case '/': a.search(); return true
          case 'e': a.events(); return true
          case 't': a.tour(); return true
          case 'r': a.reset(); return true
          case '+': case '=': a.zoom(-1); return true
          case '-': case '_': a.zoom(1); return true
          case 'f': a.fullscreen(); return true
          case 's': a.screenshot(); return true
          case 'l': a.live(); return true
          case '?': a.help(); return true
          default: return false
        }
      })()
      if (handled) e.preventDefault()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // ── Render ──────────────────────────────────────────────────────────────
  const placing = placementMode ? EVENT_BY_ID[placementMode] : null
  const connectionNotice = status === 'offline'
    ? 'You are offline — reconnecting when the network returns'
    : status === 'reconnecting' || status === 'stale'
      ? 'Connection interrupted — reconnecting…'
      : null

  const sharedHud = {
    gridData, status, prefs,
    overlayMode, onOverlayMode: setOverlayMode,
    searchRef, onSearchSelect: handleSearchSelect,
    locations, activeCity, seeding, onSeed: handleSeed,
    speed, speedBusy: false, onSpeedChange: handleSpeedChange,
    globeApi, fullscreen, onShare: share,
    onHelp: () => setDialog('help'), onSettings: () => setDialog('settings'),
    tourActive, onToggleTour: toggleTour, onFocus: focusOn,
  }

  return (
    <div className="app" data-placing={Boolean(placementMode)}>
      <main className="globe-layer" aria-label="Weather globe">
        {webgl ? (
          <ErrorBoundary fallback={() => (
            <GlobeFallback title="The 3D globe stopped working"
              message="Your graphics driver may have reset. Reloading usually fixes it."
              action={<button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>Reload</button>} />
          )}>
            <Suspense fallback={null}>
              <WeatherGlobe
                apiRef={globeApi}
                weatherData={weatherData}
                gridData={gridData}
                previewData={previewSnap}
                overlayMode={overlayMode}
                flyTo={flyTo}
                selected={selected}
                onGlobeClick={handleGlobeClick}
                onViewChange={setView}
                onReady={handleGlobeReady}
                initialView={startView}
                quality={prefs.quality}
                layout={layout}
                autoRotate={prefs.autoRotate && !popup && !placementMode}
                reducedMotion={reducedMotion}
                tourActive={tourActive}
                prefs={prefs}
              />
            </Suspense>
          </ErrorBoundary>
        ) : (
          <GlobeFallback title="3D view unavailable"
            message="This browser or device has WebGL 2 turned off, so the globe can’t be drawn. Search, live statistics and forecasts still work." />
        )}
      </main>

      {isMobile ? (
        <MobileHUD
          {...sharedHud}
          searchOpen={searchOpen}
          onSearchOpenChange={setSearchOpen}
          placementMode={placementMode}
          onStartPlacement={startPlacement}
          intensity={intensity}
          onIntensity={setIntensity}
          sheetOpen={sheetOpen}
          onSheetOpenChange={setSheetOpen}
          onOpenTime={() => setTimeOpen(true)}
          floatingHidden={Boolean(popup) || timeOpen}
        />
      ) : (
        <>
          <WeatherHUD {...sharedHud} layout={layout} weatherData={weatherData} />
          {/* One column, so the legend, injector and stats can never overlap. */}
          <div className="left-rail">
            <Legend mode={overlayMode} prefs={prefs} />
            <EventPanel
              open={eventPanelOpen}
              onToggle={() => setEventPanelOpen(open => !open)}
              placementMode={placementMode}
              onStartPlacement={startPlacement}
              intensity={intensity}
              onIntensity={setIntensity}
            />
            <SimStats gridData={gridData} weatherData={weatherData} prefs={prefs} onFocus={focusOn} />
          </div>
        </>
      )}

      <ForecastPanel
        layout={layout}
        open={timeOpen}
        onOpenChange={setTimeOpen}
        onPreviewSnap={setPreviewSnap}
        isPreview={Boolean(previewSnap)}
        onGoLive={goLive}
        prefs={prefs}
        hidden={Boolean(popup)}
      />

      {connectionNotice && <div className="banner banner--warn" role="status">{connectionNotice}</div>}
      {!connectionNotice && previewSnap && !timeOpen && (
        <div className="banner banner--preview" role="status">
          Previewing step {previewSnap.step ?? '—'}
          <button type="button" className="btn btn--sm" onClick={goLive}>● Live</button>
        </div>
      )}

      {placing && (
        <div className="placement-banner" role="status" style={{ '--tone': placing.tone }}>
          <span>{placing.icon} {isMobile ? 'Tap' : 'Click'} the globe to place a {placing.label.toLowerCase()}</span>
          <button type="button" className="btn btn--sm" onClick={() => setPlacementMode(null)}>Cancel</button>
        </div>
      )}

      {popup && (
        <Suspense fallback={null}>
          <WeatherPopup
            key={`${popup.lat}_${popup.lon}`}
            lat={popup.lat}
            lon={popup.lon}
            grid={previewSnap ?? gridData}
            prefs={prefs}
            onClose={closePopup}
            onInject={type => { injectAt(type, popup.lat, popup.lon); setPopup(null) }}
          />
        </Suspense>
      )}

      <Suspense fallback={null}>
        {dialog === 'help' && <HelpDialog onClose={closeDialog} />}
        {dialog === 'settings' && <SettingsDialog prefs={prefs} onChange={updatePrefs} onClose={closeDialog} />}
      </Suspense>

      <div className="toasts" role="status" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className="toast" style={{ '--tone': t.color }}>{t.message}</div>
        ))}
      </div>

      <Splash hidden={globeReady || splashTimedOut || !webgl} />
    </div>
  )
}
