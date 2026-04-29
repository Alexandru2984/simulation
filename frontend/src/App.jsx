import { useState, useEffect, useCallback } from 'react'
import WeatherGlobe from './components/WeatherGlobe'
import WeatherHUD from './components/WeatherHUD'
import WeatherPopup from './components/WeatherPopup'
import { useWeatherSocket } from './hooks/useWeatherSocket'
import { useGridSocket } from './hooks/useGridSocket'

const CITY_FLAGS = {
  'Bucharest':    '🇷🇴', 'London':       '🇬🇧', 'Tokyo':        '🇯🇵',
  'New York':     '🇺🇸', 'Sydney':       '🇦🇺', 'Dubai':        '🇦🇪',
  'Moscow':       '🇷🇺', 'Mumbai':       '🇮🇳', 'Cape Town':    '🇿🇦',
  'Buenos Aires': '🇦🇷', 'Reykjavik':    '🇮🇸', 'Singapore':    '🇸🇬',
}

export default function App() {
  const { data, status }            = useWeatherSocket()
  const { data: gridData }          = useGridSocket()
  const [locations, setLocations]   = useState([])
  const [flyToLocation, setFlyToLocation] = useState(null)
  const [overlayMode, setOverlayMode]     = useState('temp')
  const [popup, setPopup]                 = useState(null)  // { lat, lon }

  useEffect(() => {
    fetch('/api/weather/locations')
      .then(r => r.json())
      .then(d => setLocations((d.locations || []).map(loc => ({
        ...loc, flag: CITY_FLAGS[loc.name] || '📍',
      }))))
      .catch(() => {})
  }, [])

  const handleSeed = useCallback(async (lat, lon, name) => {
    setFlyToLocation({ lat, lon })
    try {
      await fetch(`/api/weather/seed?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`)
    } catch (_) {}
  }, [])

  // Globe click: fly-to + show popup with real OWM data
  const handleGlobeClick = useCallback((lat, lon) => {
    setFlyToLocation({ lat, lon })
    setPopup({ lat, lon })
  }, [])

  // Search result select: fly-to + seed + popup
  const handleSearchSelect = useCallback((lat, lon, name) => {
    handleSeed(lat, lon, name)
    setPopup({ lat, lon })
  }, [handleSeed])

  const handleSpeedChange = useCallback((value) => {
    fetch(`/api/weather/speed?value=${value}`).catch(() => {})
  }, [])

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden', background: '#030711' }}>
      <WeatherGlobe
        weatherData={data}
        onGlobeClick={handleGlobeClick}
        flyToLocation={flyToLocation}
        gridData={gridData}
        overlayMode={overlayMode}
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
      />
      {popup && (
        <WeatherPopup
          lat={popup.lat}
          lon={popup.lon}
          onClose={() => setPopup(null)}
        />
      )}
    </div>
  )
}

