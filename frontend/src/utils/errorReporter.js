// Sends uncaught browser errors to the backend (POST /api/client-errors), so
// crashes on devices we never test show up in the server log.
//
// Anonymous by design: no page URL (its hash holds the place being viewed),
// no cookies, no identifiers. URLs inside stacks are cut to paths on this
// site. At most MAX_REPORTS distinct reports leave a page load.

export const ENDPOINT = '/api/client-errors'
const MAX_REPORTS = 5
const MAX_MESSAGE = 300
const MAX_SOURCE = 300
const MAX_STACK = 3500
// The backend refuses bodies over 8 KiB; leave room for rounding.
export const MAX_BODY_BYTES = 8000

// Noise that says nothing about this app.
const IGNORED_MESSAGES = [
  /^Script error\.?$/i,                       // opaque cross-origin error
  /^ResizeObserver loop/i,                    // benign browser warning
  /^(Uncaught )?AbortError\b/,                // cancelled fetches
]
const EXTENSION_URL = /\b(?:chrome|moz|safari(?:-web)?|ms-browser)-extension:\/\//i

// Cuts on a code point boundary: half a surrogate pair is invalid JSON
// for the backend's parser and would lose the whole report.
function truncate(text, max) {
  if (text.length <= max) return text
  let end = Math.max(0, max - 1)
  const last = text.charCodeAt(end - 1)
  if (last >= 0xd800 && last <= 0xdbff) end -= 1
  return `${text.slice(0, end)}…`
}

const encoder = new TextEncoder()
const jsonBytes = value => encoder.encode(JSON.stringify(value)).length

// Character limits are not byte limits: 3500 CJK characters are ~10 KB of
// UTF-8. Shortens the stack until the JSON body fits; the other fields are
// bounded well below the limit on their own.
export function fitReport(report, maxBytes = MAX_BODY_BYTES) {
  let size = jsonBytes(report)
  while (size > maxBytes && report.stack) {
    const keep = Math.floor(report.stack.length * (maxBytes / size)) - 16
    if (keep < 32) delete report.stack
    else report.stack = truncate(report.stack, keep)
    size = jsonBytes(report)
  }
  return report
}

function describe(error) {
  if (error instanceof Error) {
    const name = error.name && error.name !== 'Error' ? `${error.name}: ` : ''
    return { message: `${name}${error.message || '(no message)'}`, stack: error.stack || '', name: error.name }
  }
  if (typeof error === 'string') return { message: error, stack: '' }
  try {
    return { message: `Non-error value: ${JSON.stringify(error)?.slice(0, 200) ?? String(error)}`, stack: '' }
  } catch {
    return { message: `Non-error value: ${Object.prototype.toString.call(error)}`, stack: '' }
  }
}

const hostOf = origin => {
  try {
    return new URL(origin).host
  } catch {
    return null
  }
}

// URLs on this site (https or wss) become paths; queries and fragments (the
// hash holds the viewed coordinates) are dropped everywhere.
export function scrubUrls(text, origin) {
  const host = hostOf(origin)
  return text.replace(/\b(?:https?|wss?):\/\/[^\s)'"]+/g, url => {
    let parsed
    try {
      parsed = new URL(url)
    } catch {
      return url.replace(/[?#].*$/, '')
    }
    // Keep a stack frame's ":line:col" suffix, which URL() leaves in the path.
    const path = parsed.pathname
    return parsed.host === host ? path : `${parsed.origin}${path}`
  })
}

export function buildReport(kind, error, { origin, build, source, line, col, componentStack } = {}) {
  const described = describe(error)
  if (described.name === 'AbortError') return null
  const message = truncate(described.message.trim(), MAX_MESSAGE)
  if (!message || IGNORED_MESSAGES.some(re => re.test(message))) return null

  let stack = described.stack
  if (componentStack) stack = `${stack}\nComponent stack:${componentStack}`
  if (EXTENSION_URL.test(stack) || EXTENSION_URL.test(source ?? '')) return null

  const report = { kind, message: scrubUrls(message, origin) }
  if (stack.trim()) report.stack = truncate(scrubUrls(stack.trim(), origin), MAX_STACK)
  if (source) report.source = truncate(scrubUrls(source, origin), MAX_SOURCE)
  if (Number.isInteger(line) && line > 0) report.line = line
  if (Number.isInteger(col) && col > 0) report.col = col
  if (build) report.build = build
  return fitReport(report)
}

// `send(report)` delivers one report; tests pass a fake.
export function createErrorReporter({ send, origin, build, maxReports = MAX_REPORTS }) {
  const seen = new Set()
  let sent = 0
  return {
    report(kind, error, extra = {}) {
      if (sent >= maxReports) return false
      let report
      try {
        report = buildReport(kind, error, { ...extra, origin, build })
      } catch {
        return false
      }
      if (!report) return false
      const key = `${report.kind}|${report.message}|${report.source ?? ''}|${report.line ?? ''}`
      if (seen.has(key)) return false
      seen.add(key)
      sent++
      try {
        send(report)
      } catch {
        // Reporting must never throw into the code that hit the error.
      }
      return true
    },
  }
}

// "/assets/index-BX3k9a.js" → "index-BX3k9a": identifies the exact build
// without revealing the commit.
export function buildIdFromUrl(url) {
  const match = /\/([A-Za-z0-9_.-]{1,64})\.js(?:[?#].*)?$/.exec(url ?? '')
  return match ? match[1] : undefined
}

function sendWithFetch(report) {
  fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report),
    keepalive: true,
    credentials: 'omit',
  }).catch(() => {})
}

let active = null

// Wires the reporter to window error events. Call once, in production only.
export function installErrorReporting({ build } = {}) {
  if (active || typeof window === 'undefined') return active
  active = createErrorReporter({ send: sendWithFetch, origin: window.location.origin, build })
  window.addEventListener('error', event => {
    active.report('error', event.error ?? event.message, {
      source: event.filename, line: event.lineno, col: event.colno,
    })
  })
  window.addEventListener('unhandledrejection', event => {
    active.report('rejection', event.reason)
  })
  return active
}

// For errors the app catches itself (error boundary, stream decoding).
export function reportError(kind, error, extra) {
  return active?.report(kind, error, extra) ?? false
}
