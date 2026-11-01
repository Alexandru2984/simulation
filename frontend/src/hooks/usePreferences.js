import { useCallback, useState } from 'react'
import { TEMPERATURE_UNITS, WIND_UNITS } from '../utils/units'

const STORAGE_KEY = 'weather-sim:prefs:v1'

export const QUALITY_LEVELS = ['auto', 'low', 'high']

const DEFAULTS = {
  tempUnit: 'c',
  windUnit: 'ms',
  quality: 'auto',
  autoRotate: true,
}

// Only known keys with valid values survive a read, so a tampered or stale
// localStorage entry can never put the UI into an invalid state.
function sanitize(raw) {
  const prefs = { ...DEFAULTS }
  if (!raw || typeof raw !== 'object') return prefs
  if (Object.hasOwn(TEMPERATURE_UNITS, raw.tempUnit)) prefs.tempUnit = raw.tempUnit
  if (Object.hasOwn(WIND_UNITS, raw.windUnit)) prefs.windUnit = raw.windUnit
  if (QUALITY_LEVELS.includes(raw.quality)) prefs.quality = raw.quality
  if (typeof raw.autoRotate === 'boolean') prefs.autoRotate = raw.autoRotate
  return prefs
}

function load() {
  try {
    return sanitize(JSON.parse(window.localStorage.getItem(STORAGE_KEY)))
  } catch {
    return { ...DEFAULTS }
  }
}

export function usePreferences() {
  const [prefs, setPrefs] = useState(load)
  const update = useCallback(patch => {
    setPrefs(prev => {
      const next = sanitize({ ...prev, ...patch })
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // Private mode or blocked storage: keep the in-memory value.
      }
      return next
    })
  }, [])
  return [prefs, update]
}
