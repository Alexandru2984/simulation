import { t } from '../i18n/i18n.js'

// Small fetch helpers that turn the backend's error contract into readable,
// translated messages. A proxy in between may still answer with HTML, so
// never assume JSON.

// Backend error codes with a translation (src/i18n: error.<code>).
const KNOWN_CODES = new Set([
  'api_key_not_configured', 'upstream_rate_limited', 'upstream_failed',
  'upstream_response_too_large', 'upstream_invalid_payload', 'invalid_query',
  'invalid_lat_lon', 'lat_lon_out_of_range', 'out_of_range', 'invalid_json',
  'invalid_type', 'missing_fields', 'unknown_event_type', 'invalid_limit',
  'rate_limited', 'forbidden_origin', 'unsupported_media_type', 'unauthorized',
])

export function describeApiError(status, code) {
  if (code && KNOWN_CODES.has(code)) return t(`error.${code}`)
  if (status === 429) return t('error.tooManyRequests')
  if (status === 403) return t('error.blocked')
  if (status >= 500) return t('error.server')
  return t('error.failed')
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
    return { ok: false, error: t('error.network') }
  }
}
