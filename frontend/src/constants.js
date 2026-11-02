// Shared UI vocabulary: overlay layers, injectable events and speeds. Names
// and descriptions are translated: t(`layer.${id}`), t(`event.${id}`),
// t(`event.${id}.desc`), t(`status.${status}`).

export const LAYERS = [
  { id: 'none', icon: '🌍', tone: '#94a3b8', key: '1' },
  { id: 'temp', icon: '🌡️', tone: '#f97316', key: '2' },
  { id: 'pressure', icon: '🔵', tone: '#60a5fa', key: '3' },
  { id: 'humidity', icon: '💧', tone: '#34d399', key: '4' },
  { id: 'precip', icon: '🌧️', tone: '#818cf8', key: '5' },
  { id: 'wind', icon: '💨', tone: '#38bdf8', key: '6' },
  { id: 'storm', icon: '⚡', tone: '#f59e0b', key: '7' },
]

export const EVENTS = [
  { id: 'cyclone', icon: '🌀', tone: '#a855f7' },
  { id: 'heat_dome', icon: '🌡️', tone: '#f97316' },
  { id: 'cold_outbreak', icon: '❄️', tone: '#60a5fa' },
  { id: 'blocking_high', icon: '🔵', tone: '#34d399' },
  { id: 'tornado', icon: '🌪️', tone: '#fbbf24' },
]

export const EVENT_BY_ID = Object.fromEntries(EVENTS.map(e => [e.id, e]))

export const SPEEDS = [0.5, 1, 2, 5, 10, 20, 50]

export const STATUS_COLORS = {
  connected: '#22c55e',
  connecting: '#60a5fa',
  reconnecting: '#f59e0b',
  stale: '#fb923c',
  full: '#a855f7',
  offline: '#ef4444',
}


const CITY_FLAGS = {
  RO: '🇷🇴', GB: '🇬🇧', JP: '🇯🇵', US: '🇺🇸', AU: '🇦🇺', AE: '🇦🇪',
  RU: '🇷🇺', IN: '🇮🇳', ZA: '🇿🇦', AR: '🇦🇷', IS: '🇮🇸', SG: '🇸🇬',
}

export function flagFor(country) {
  return CITY_FLAGS[country] ?? '📍'
}
