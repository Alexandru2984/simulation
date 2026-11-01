import assert from 'node:assert/strict'
import test from 'node:test'
import { buildViewHash, parseViewHash } from './viewState.js'

test('view links roundtrip', () => {
  const hash = buildViewHash({ lat: 44.4268, lon: 26.1025, layer: 'pressure' })
  assert.equal(hash, '#lat=44.43&lon=26.10&layer=pressure')
  assert.deepEqual(parseViewHash(hash), { lat: 44.43, lon: 26.1, layer: 'pressure' })
  assert.equal(buildViewHash({}), '')
})

test('hostile or partial hashes are ignored safely', () => {
  assert.deepEqual(parseViewHash('#lat=91&lon=0'), {})
  assert.deepEqual(parseViewHash('#lat=1e3&lon=0'), {})
  assert.deepEqual(parseViewHash('#lat=10'), {})
  assert.deepEqual(parseViewHash('#layer=<script>'), {})
  assert.deepEqual(parseViewHash('#layer=__proto__'), {})
  assert.deepEqual(parseViewHash('#lat=-33.9&lon=151.2&x=1'), { lat: -33.9, lon: 151.2 })
  assert.deepEqual(parseViewHash(undefined), {})
})
