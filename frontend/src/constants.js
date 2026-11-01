// Shared UI vocabulary: overlay layers, injectable events and speeds.

export const LAYERS = [
  { id: 'none', icon: '🌍', label: 'Globe', tone: '#94a3b8', key: '1' },
  { id: 'temp', icon: '🌡️', label: 'Temp', tone: '#f97316', key: '2' },
  { id: 'pressure', icon: '🔵', label: 'Pressure', tone: '#60a5fa', key: '3' },
  { id: 'humidity', icon: '💧', label: 'Humidity', tone: '#34d399', key: '4' },
  { id: 'precip', icon: '🌧️', label: 'Precip', tone: '#818cf8', key: '5' },
  { id: 'wind', icon: '💨', label: 'Wind', tone: '#38bdf8', key: '6' },
  { id: 'storm', icon: '⚡', label: 'Storm', tone: '#f59e0b', key: '7' },
]

export const EVENTS = [
  { id: 'cyclone', icon: '🌀', label: 'Cyclone', tone: '#a855f7', desc: 'Deep low with rotating winds' },
  { id: 'heat_dome', icon: '🌡️', label: 'Heat dome', tone: '#f97316', desc: 'Up to +18 °C under high pressure' },
  { id: 'cold_outbreak', icon: '❄️', label: 'Cold air', tone: '#60a5fa', desc: 'Up to −22 °C polar air mass' },
  { id: 'blocking_high', icon: '🔵', label: 'Blocking', tone: '#34d399', desc: 'Strong, dry anticyclone' },
  { id: 'tornado', icon: '🌪️', label: 'Tornado', tone: '#fbbf24', desc: 'Tight, intense vortex' },
]

export const EVENT_BY_ID = Object.fromEntries(EVENTS.map(e => [e.id, e]))

export const SPEEDS = [0.5, 1, 2, 5, 10, 20, 50]

export const STATUS_COLORS = {
  connected: '#22c55e',
  connecting: '#60a5fa',
  reconnecting: '#f59e0b',
  stale: '#fb923c',
  offline: '#ef4444',
}

export const STATUS_LABELS = {
  connected: 'Live',
  connecting: 'Connecting',
  reconnecting: 'Reconnecting',
  stale: 'Stalled',
  offline: 'Offline',
}

const CITY_FLAGS = {
  RO: '🇷🇴', GB: '🇬🇧', JP: '🇯🇵', US: '🇺🇸', AU: '🇦🇺', AE: '🇦🇪',
  RU: '🇷🇺', IN: '🇮🇳', ZA: '🇿🇦', AR: '🇦🇷', IS: '🇮🇸', SG: '🇸🇬',
}

export function flagFor(country) {
  return CITY_FLAGS[country] ?? '📍'
}
