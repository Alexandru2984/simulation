import assert from 'node:assert/strict'
import test from 'node:test'
import { ApiError, apiErrorMessage, describeApiError, fetchErrorMessage } from './api.js'

test('known backend error codes map to readable messages', () => {
  assert.match(describeApiError(429, 'upstream_rate_limited'), /busy/)
  assert.match(describeApiError(400, 'invalid_query'), /letters/)
  assert.match(describeApiError(429, null), /Slow down/)
  assert.match(describeApiError(502, 'something_new'), /Server error/)
})

test('HTML rate-limit pages from nginx do not break error handling', async () => {
  const html = new Response('<html>503</html>', { status: 503, headers: { 'content-type': 'text/html' } })
  assert.match(await apiErrorMessage(html), /Server error/)
  const json = new Response('{"error":"rate_limited"}', { status: 429, headers: { 'content-type': 'application/json' } })
  assert.match(await apiErrorMessage(json), /Too many changes/)
})

test('fetch failures never show raw browser text', () => {
  assert.equal(fetchErrorMessage(new ApiError('Invalid coordinates')), 'Invalid coordinates')
  assert.match(fetchErrorMessage(new TypeError('Failed to fetch')), /Network error/)
  assert.match(fetchErrorMessage(new SyntaxError('Unexpected token <')), /Request failed/)
  assert.match(fetchErrorMessage(new SyntaxError('x'), 'search.failed'), /Search failed/)
  assert.match(fetchErrorMessage(undefined), /Request failed/)
})
