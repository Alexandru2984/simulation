import assert from 'node:assert/strict'
import test from 'node:test'
import { apiErrorMessage, describeApiError } from './api.js'

test('known backend error codes map to readable messages', () => {
  assert.match(describeApiError(429, 'upstream_rate_limited'), /busy/)
  assert.match(describeApiError(400, 'invalid_query'), /letters/)
  assert.match(describeApiError(429, null), /Slow down/)
  assert.match(describeApiError(502, 'something_new'), /Server error/)
})

test('HTML rate-limit pages from nginx do not break error handling', async () => {
  const html = new Response('<html>503</html>', { status: 503, headers: { 'content-type': 'text/html' } })
  assert.match(await apiErrorMessage(html), /Server error/)
  const json = new Response('{"error":"rate limited"}', { status: 429, headers: { 'content-type': 'application/json' } })
  assert.match(await apiErrorMessage(json), /Too many changes/)
})
