// Small fetch helpers that turn the backend's error contract into readable
// messages. Rate-limit responses from nginx are HTML, so never assume JSON.

const MESSAGES = {
  api_key_not_configured: 'Live weather is not configured on this server',
  upstream_rate_limited: 'Live weather is busy — try again in a moment',
  upstream_failed: 'Weather provider did not respond',
  upstream_response_too_large: 'Weather provider sent an invalid response',
  upstream_invalid_payload: 'Weather provider sent an invalid response',
  invalid_query: 'Use letters, spaces, commas or hyphens',
  invalid_lat_lon: 'Invalid coordinates',
  lat_lon_out_of_range: 'Coordinates out of range',
  'rate limited': 'Too many changes right now — try again shortly',
  'forbidden origin': 'Request blocked by the server',
  unauthorized: 'This action is restricted on this server',
}

export function describeApiError(status, code) {
  if (code && MESSAGES[code]) return MESSAGES[code]
  if (status === 429) return 'Slow down — too many requests'
  if (status === 403) return 'Request blocked by the server'
  if (status >= 500) return 'Server error — try again shortly'
  return 'Request failed'
}

export async function apiErrorMessage(res) {
  let code = null
  try {
    const type = res.headers.get('content-type') || ''
    if (type.includes('application/json')) code = (await res.json())?.error ?? null
  } catch {
    // Body was not JSON; fall back to the status code.
  }
  return describeApiError(res.status, code)
}

// POST JSON and resolve to { ok, data, error }.
export async function postJson(url, body, { signal } = {}) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
    if (!res.ok) return { ok: false, error: await apiErrorMessage(res) }
    let data = null
    try { data = await res.json() } catch { /* empty body */ }
    return { ok: true, data }
  } catch (err) {
    if (err?.name === 'AbortError') return { ok: false, aborted: true }
    return { ok: false, error: 'Network error — check your connection' }
  }
}
