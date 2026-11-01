// Shareable view links: #lat=44.43&lon=26.10&layer=temp
// Everything read from the URL is validated; unknown keys are ignored.

export const LAYER_IDS = ['none', 'temp', 'pressure', 'humidity', 'precip', 'wind', 'storm']

function parseCoordinate(text, limit) {
  if (typeof text !== 'string' || !/^-?\d{1,3}(\.\d{1,6})?$/.test(text)) return null
  const value = Number(text)
  return Number.isFinite(value) && Math.abs(value) <= limit ? value : null
}

export function parseViewHash(hash) {
  const params = new URLSearchParams(String(hash || '').replace(/^#/, ''))
  const view = {}
  const lat = parseCoordinate(params.get('lat'), 90)
  const lon = parseCoordinate(params.get('lon'), 180)
  if (lat !== null && lon !== null) {
    view.lat = lat
    view.lon = lon
  }
  const layer = params.get('layer')
  if (LAYER_IDS.includes(layer)) view.layer = layer
  return view
}

export function buildViewHash({ lat, lon, layer } = {}) {
  const params = new URLSearchParams()
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    params.set('lat', lat.toFixed(2))
    params.set('lon', lon.toFixed(2))
  }
  if (LAYER_IDS.includes(layer)) params.set('layer', layer)
  const text = params.toString()
  return text ? `#${text}` : ''
}
