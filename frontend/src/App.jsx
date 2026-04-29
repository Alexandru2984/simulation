import { useState, useEffect, useCallback } from 'react'
import WeatherGlobe from './components/WeatherGlobe'
import WeatherHUD from './components/WeatherHUD'
import { useWeatherSocket } from './hooks/useWeatherSocket'

const CITY_FLAGS = {
  'Bucharest':    '🇷🇴', 'London':       '🇬🇧', 'Tokyo':        '🇯🇵',
  'New York':     '🇺🇸', 'Sydney':       '🇦🇺', 'Dubai':        '🇦🇪',
  'Moscow':       '🇷🇺', 'Mumbai':       '🇮🇳', 'Cape Town':    '🇿🇦',
  'Buenos Aires': '🇦🇷', 'Reykjavik':    '🇮🇸', 'Singapore':    '🇸🇬',
}

export default function App() {
  const { data, status } = useWeatherSocket()
  const [locations, setLocations]         = useState([])
  const [flyToLocation, setFlyToLocation] = useState(null)

  useEffect(() => {
    fetch('/api/weather/locations')
      .then(r => r.json())
      .then(d => setLocations((d.locations || []).map(loc => ({
        ...loc, flag: CITY_FLAGS[loc.name] || '📍',
      }))))
      .catch(() => {})
  }, [])

  // Seed the simulation AND fly the camera to that location
  const handleSeed = useCallback(async (lat, lon, name) => {
    setFlyToLocation({ lat, lon })
    try {
      await fetch(`/api/weather/seed?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`)
    } catch (_) {}
  }, [])

  const handleGlobeClick = useCallback((lat, lon) => {
    handleSeed(lat, lon, null)
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
      />
      <WeatherHUD
        weatherData={data}
        status={status}
        onSeed={handleSeed}
        onSpeedChange={handleSpeedChange}
        locations={locations}
      />
    </div>
  )
}
