import assert from 'node:assert/strict'
import test from 'node:test'
import { deflateSync } from 'node:zlib'
import { decodeCompressedGridFrame, decodeGridFrame, decodeGridMessage } from './gridCodec.js'

function encode(header, fieldValues) {
  const headerBytes = new TextEncoder().encode(JSON.stringify(header))
  const offset = (8 + headerBytes.length + 3) & ~3
  const total = offset + fieldValues.reduce((sum, values) => sum + values.length * 2, 0)
  const buffer = new ArrayBuffer(total)
  const bytes = new Uint8Array(buffer)
  bytes.set([0x47, 0x53, 0x42, 0x31])
  const view = new DataView(buffer)
  view.setUint32(4, headerBytes.length, true)
  bytes.set(headerBytes, 8)
  let pos = offset
  for (const values of fieldValues) {
    for (const q of values) { view.setInt16(pos, q, true); pos += 2 }
  }
  return buffer
}

test('binary frames decode scaled fields and keep header values', () => {
  const buffer = encode(
    { tick: 9, rows: 1, cols: 2, viewers: 4, storms: [], fields: [['T', 100, 0], ['P', 100, 1000]] },
    [[1234, -500], [1325, -6000]],
  )
  const frame = decodeGridFrame(buffer)
  assert.equal(frame.tick, 9)
  assert.equal(frame.viewers, 4)
  assert.equal(frame.fields, undefined)
  assert.ok(Math.abs(frame.T[0] - 12.34) < 1e-4)
  assert.ok(Math.abs(frame.T[1] + 5) < 1e-4)
  assert.ok(Math.abs(frame.P[0] - 1013.25) < 1e-3)
  assert.ok(Math.abs(frame.P[1] - 940) < 1e-3)
})

test('malformed or hostile frames are rejected', () => {
  const ok = { rows: 1, cols: 1, fields: [['T', 100, 0]] }
  assert.equal(decodeGridFrame(new ArrayBuffer(4)), null)
  assert.equal(decodeGridFrame(encode({ ...ok, fields: [['__proto__', 1, 0]] }, [[1]])), null)
  assert.equal(decodeGridFrame(encode({ ...ok, fields: [['T', 0, 0]] }, [[1]])), null)
  assert.equal(decodeGridFrame(encode({ ...ok, rows: 0 }, [[1]])), null)
  // Header promises more cells than the payload holds.
  assert.equal(decodeGridFrame(encode({ ...ok, rows: 10 }, [[1]])), null)
  const bad = new Uint8Array(encode(ok, [[1]]))
  bad[0] = 0x58
  assert.equal(decodeGridFrame(bad.buffer), null)
})

test('text frames still decode as JSON objects', () => {
  assert.deepEqual(decodeGridMessage('{"tick":1}'), { tick: 1 })
  assert.equal(decodeGridMessage('[1,2]'), null)
  assert.equal(decodeGridMessage('{oops'), null)
  assert.equal(decodeGridMessage(42), null)
})

// Mirrors GridCodec::compressPacked in the backend: per-row deltas (int16
// wrap), byte shuffle, zlib.
function encodeCompressed(header, fieldValues, { mangle } = {}) {
  const { rows, cols } = header
  const n = fieldValues.length * rows * cols
  const shuffled = new Uint8Array(n * 2)
  let i = 0
  for (const values of fieldValues) {
    for (let r = 0; r < rows; r++) {
      let prev = 0
      for (let c = 0; c < cols; c++, i++) {
        const value = values[r * cols + c] & 0xffff
        const delta = (value - prev) & 0xffff
        prev = value
        shuffled[i] = delta & 0xff
        shuffled[n + i] = delta >> 8
      }
    }
  }
  let payload = deflateSync(mangle?.raw ?? shuffled)
  if (mangle?.truncate) payload = payload.subarray(0, payload.length >> 1)
  const headerBytes = new TextEncoder().encode(JSON.stringify({ encoding: 'row-delta+byte-shuffle+zlib', ...header }))
  const offset = (8 + headerBytes.length + 3) & ~3
  const buffer = new ArrayBuffer(offset + payload.length)
  const bytes = new Uint8Array(buffer)
  bytes.set([0x47, 0x53, 0x42, 0x32])
  new DataView(buffer).setUint32(4, headerBytes.length, true)
  bytes.set(headerBytes, 8)
  bytes.set(payload, offset)
  return buffer
}

test('compressed frames decode to exactly the encoded values', async () => {
  const header = { tick: 3, rows: 2, cols: 3, viewers: 2, fields: [['T', 10, 0], ['P', 10, 1000]] }
  // Extremes side by side exercise the int16 wrap in the deltas.
  const T = [-32767, 32767, -32767, 125, -3, 0]
  const P = [132, 131, 129, 32767, -32767, 1]
  const frame = await decodeCompressedGridFrame(encodeCompressed(header, [T, P]))
  assert.equal(frame.tick, 3)
  assert.equal(frame.viewers, 2)
  assert.equal(frame.encoding, undefined)
  assert.deepEqual([...frame.T], T.map(q => Math.fround(q / 10)))
  assert.deepEqual([...frame.P], P.map(q => Math.fround(q / 10 + 1000)))
})

test('decodeGridMessage routes GSB2 frames through the async decoder', async () => {
  const buffer = encodeCompressed({ rows: 1, cols: 2, fields: [['H', 1000, 0]] }, [[500, 750]])
  const result = decodeGridMessage(buffer)
  assert.ok(result instanceof Promise)
  const frame = await result
  assert.ok(Math.abs(frame.H[1] - 0.75) < 1e-6)
})

test('hostile compressed frames are rejected', async () => {
  const header = { rows: 2, cols: 2, fields: [['T', 10, 0]] }
  const values = [[1, 2, 3, 4]]
  assert.equal(await decodeCompressedGridFrame(encodeCompressed(header, values, { mangle: { truncate: true } })), null)
  // A "zip bomb": far more data than the header's grid can hold.
  assert.equal(await decodeCompressedGridFrame(encodeCompressed(header, values, { mangle: { raw: new Uint8Array(1 << 20) } })), null)
  // Too little data for the grid.
  assert.equal(await decodeCompressedGridFrame(encodeCompressed(header, values, { mangle: { raw: new Uint8Array(4) } })), null)
  // Unknown encoding, wrong magic, hostile field names.
  const unknown = new Uint8Array(encodeCompressed(header, values))
  assert.equal(await decodeCompressedGridFrame(encode(header, values)), null)
  unknown[3] = 0x33
  assert.equal(await decodeCompressedGridFrame(unknown.buffer), null)
  assert.equal(await decodeCompressedGridFrame(encodeCompressed({ ...header, fields: [['constructor', 1, 0]] }, values)), null)
  assert.equal(await decodeCompressedGridFrame(encodeCompressed({ ...header, encoding: 'brotli' }, values)), null)
})
