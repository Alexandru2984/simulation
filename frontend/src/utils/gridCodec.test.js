import assert from 'node:assert/strict'
import test from 'node:test'
import { decodeGridFrame, decodeGridMessage } from './gridCodec.js'

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
