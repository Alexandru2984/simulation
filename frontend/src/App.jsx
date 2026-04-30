import { useState, useEffect, useCallback, useRef } from 'react'
import WeatherGlobe from './components/WeatherGlobe'
import WeatherHUD from './components/WeatherHUD'
import WeatherPopup from './components/WeatherPopup'
import EventPanel from './components/EventPanel'
import SimStats from './components/SimStats'
import ForecastPanel from './components/ForecastPanel'
import { useWeatherSocket } from './hooks/useWeatherSocket'
import { useGridSocket } from './hooks/useGridSocket'

const CITY_FLAGS = {
  'Bucharest':    '🇷🇴', 'London':       '🇬🇧', 'Tokyo':        '🇯🇵',
  'New York':     '🇺🇸', 'Sydney':       '🇦🇺', 'Dubai':        '🇦🇪',
  'Moscow':       '🇷🇺', 'Mumbai':       '🇮🇳', 'Cape Town':    '🇿🇦',
  'Buenos Aires': '🇦🇷', 'Reykjavik':    '🇮🇸', 'Singapore':    '🇸🇬',
}

const EVENT_LABELS = {
  cyclone:       '🌀 Cyclone',
  heat_dome:     '🌡️ Heat Dome',
  cold_outbreak: '❄️ Cold Outbreak',
  blocking_high: '🔵 Blocking High',
  tornado:       '🌪️ Tornado',
}

function useIsMobile() {
  const [mobile, setMobile] = useState(window.innerWidth < 768)
  useEffect(() => {
    const h = () => setMobile(window.innerWidth < 768)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  return mobile
}

export default function App() {
  const { data, status }            = useWeatherSocket()
  const { data: gridData }          = useGridSocket()
  const [locations, setLocations]   = useState([])
  const [flyToLocation, setFlyToLocation] = useState(null)
  const [overlayMode, setOverlayMode]     = useState('temp')
  const [popup, setPopup]                 = useState(null)
  const [placementMode, setPlacementMode] = useState(null)   // event type string | null
  const [previewSnap, setPreviewSnap]     = useState(null)   // null = live data
  const [toast, setToast]                 = useState(null)
  const toastTimerRef                     = useRef(null)
  const isMobile                          = useIsMobile()

  useEffect(() => {
    fetch('/api/weather/locations')
      .then(r => r.json())
      .then(d => setLocations((d.locations || []).map(loc => ({
        ...loc, flag: CITY_FLAGS[loc.name] || '📍',
      }))))
      .catch(() => {})
  }, [])

  const showToast = useCallback((msg, color = '#22c55e') => {
    setToast({ msg, color })
    clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToast(null), 3500)
  }, [])

  const handleSeed = useCallback(async (lat, lon) => {
    setFlyToLocation({ lat, lon })
    try {
      await fetch('/api/weather/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lon }),
      })
    } catch (_) {}
  }, [])


  // Globe click: either place an event OR fly-to + popup
  const handleGlobeClick = useCallback(async (lat, lon) => {
    if (placementMode) {
      try {
        const res = await fetch('/api/grid/inject', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: placementMode, lat, lon, intensity: 1.0 }),
        })
        if (res.ok) {
          showToast(`${EVENT_LABELS[placementMode]} injected at ${lat.toFixed(1)}°, ${lon.toFixed(1)}°`, '#a855f7')
          setFlyToLocation({ lat, lon })
        }
      } catch (_) {}
      setPlacementMode(null)
      return
    }
    setFlyToLocation({ lat, lon })
    setPopup({ lat, lon })
  }, [placementMode, showToast])

  const handleSearchSelect = useCallback((lat, lon, name) => {
    handleSeed(lat, lon)
    setPopup({ lat, lon })
  }, [handleSeed])

  const handleSpeedChange = useCallback((value) => {
    fetch('/api/weather/speed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    }).catch(() => {})
  }, [])

  const cursorStyle = placementMode ? 'crosshair' : 'default'

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden', background: '#030711', cursor: cursorStyle }}>
      <WeatherGlobe
        weatherData={data}
        onGlobeClick={handleGlobeClick}
        flyToLocation={flyToLocation}
        gridData={gridData}
        overlayMode={overlayMode}
        previewData={previewSnap}
      />

      <WeatherHUD
        weatherData={data}
        status={status}
        onSeed={handleSeed}
        onSpeedChange={handleSpeedChange}
        onSearchSelect={handleSearchSelect}
        locations={locations}
        overlayMode={overlayMode}
        onOverlayMode={setOverlayMode}
        isMobile={isMobile}
        /* Mobile event + stats extras */
        gridData={gridData}
        onStartPlacement={setPlacementMode}
        placementMode={placementMode}
      />

      {/* Desktop-only: event panel left side + sim stats bottom-left */}
      {!isMobile && (
        <>
          <EventPanel
            onStartPlacement={setPlacementMode}
            placementMode={placementMode}
            isMobile={false}
          />
          <SimStats gridData={gridData} isMobile={false} />
        </>
      )}

      {/* Forecast / History panel — handles its own mobile/desktop layout */}
      <ForecastPanel onPreviewSnap={setPreviewSnap} />

      {popup && (
        <WeatherPopup lat={popup.lat} lon={popup.lon} onClose={() => setPopup(null)} />
      )}

      {/* Placement mode hint banner */}
      {placementMode && (
        <div style={{
          position: 'fixed', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%) translateY(-120px)',
          zIndex: 40, background: '#1e0a3cee',
          border: '1px solid #a855f7', borderRadius: 14,
          padding: '10px 20px', color: '#e2e8f0',
          fontSize: '0.9rem', fontWeight: 600,
          backdropFilter: 'blur(12px)',
          boxShadow: '0 4px 24px #a855f744',
          pointerEvents: 'none',
        }}>
          {EVENT_LABELS[placementMode]} — click on the globe to place
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 80, left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 60, background: '#0f172aee',
          border: `1px solid ${toast.color}`,
          borderRadius: 12, padding: '10px 20px',
          color: toast.color, fontSize: '0.85rem', fontWeight: 600,
          backdropFilter: 'blur(12px)',
          boxShadow: `0 4px 20px ${toast.color}44`,
          pointerEvents: 'none',
          animation: 'fadeInUp 0.3s ease',
        }}>
          {toast.msg}
        </div>
      )}

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateX(-50%) translateY(12px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes pulse {
          0%,100% { opacity: 1; }
          50%      { opacity: 0.65; }
        }
      `}</style>
    </div>
  )
}


