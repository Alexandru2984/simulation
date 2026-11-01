// Decoders for the backend's grid stream (see backend/src/GridCodec.h).
//
// GSB1 (/ws/grid?format=bin1), little-endian:
//   "GSB1" | u32 headerLength | UTF-8 JSON header | zero padding to 4 bytes |
//   int16 values, field-major. The header lists [name, scale, offset] per
//   field; value = q / scale + offset.
// GSB2 (/ws/grid?format=bin2): the same, with magic "GSB2", an "encoding"
//   header key, and the int16 block replaced by a zlib stream of its row
//   deltas, byte-shuffled (low bytes, then high bytes). About 5x smaller.

const FIELD_NAMES = new Set(['T', 'P', 'U', 'V', 'H', 'R', 'SP'])
const MAX_CELLS = 1_000_000
const MAX_FIELDS = 16
const GSB2_ENCODING = 'row-delta+byte-shuffle+zlib'
const LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1
const textDecoder = new TextDecoder()

function isPositiveInt(value, max) {
  return Number.isInteger(value) && value > 0 && value <= max
}

// Validates the framing and header shared by GSB1 and GSB2. Returns null for
// anything malformed.
function parseFrame(buffer, version) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 8) return null
  const bytes = new Uint8Array(buffer)
  // "GSB" + version digit
  if (bytes[0] !== 0x47 || bytes[1] !== 0x53 || bytes[2] !== 0x42 || bytes[3] !== 0x30 + version) return null

  const view = new DataView(buffer)
  const headerLength = view.getUint32(4, true)
  if (8 + headerLength > buffer.byteLength) return null

  let header
  try {
    header = JSON.parse(textDecoder.decode(bytes.subarray(8, 8 + headerLength)))
  } catch {
    return null
  }
  if (!header || typeof header !== 'object' || Array.isArray(header)) return null

  const { rows, cols, fields } = header
  if (!isPositiveInt(rows, 1000) || !isPositiveInt(cols, 1000)) return null
  const cells = rows * cols
  if (cells > MAX_CELLS || !Array.isArray(fields) || fields.length > MAX_FIELDS) return null
  for (const entry of fields) {
    if (!Array.isArray(entry) || entry.length !== 3) return null
    const [name, scale, base] = entry
    // Allow-list the names: they become object keys.
    if (!FIELD_NAMES.has(name) || !Number.isFinite(scale) || scale <= 0 || !Number.isFinite(base)) return null
  }

  const frame = { ...header }
  delete frame.fields
  delete frame.encoding
  return { header, frame, view, rows, cols, cells, fields, offset: (8 + headerLength + 3) & ~3 }
}

function attachFields(parsed, quantizedAt) {
  const { frame, fields, cells } = parsed
  for (let f = 0; f < fields.length; f++) {
    const [name, scale, base] = fields[f]
    const values = new Float32Array(cells)
    for (let i = 0; i < cells; i++) values[i] = quantizedAt(f * cells + i) / scale + base
    frame[name] = values
  }
  return frame
}

export function decodeGridFrame(buffer) {
  const parsed = parseFrame(buffer, 1)
  if (!parsed) return null
  const { view, offset, fields, cells } = parsed
  if (offset + fields.length * cells * 2 > buffer.byteLength) return null
  if (LITTLE_ENDIAN) {
    const quantized = new Int16Array(buffer, offset, fields.length * cells)
    return attachFields(parsed, i => quantized[i])
  }
  return attachFields(parsed, i => view.getInt16(offset + i * 2, true))
}

// zlib inflate via the platform's DecompressionStream, refusing to produce
// more than `maxBytes` (a hostile stream could otherwise expand without bound).
export async function inflateZlib(bytes, maxBytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'))
  const reader = stream.getReader()
  const out = new Uint8Array(maxBytes)
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (size + value.byteLength > maxBytes) {
      await reader.cancel()
      throw new Error('inflated grid payload is larger than the grid')
    }
    out.set(value, size)
    size += value.byteLength
  }
  return out.subarray(0, size)
}

export const supportsCompressedFrames = () => typeof DecompressionStream === 'function'

export async function decodeCompressedGridFrame(buffer, inflate = inflateZlib) {
  const parsed = parseFrame(buffer, 2)
  if (!parsed || parsed.header.encoding !== GSB2_ENCODING) return null
  const { offset, fields, rows, cols, cells } = parsed
  const n = fields.length * cells

  let shuffled
  try {
    shuffled = await inflate(new Uint8Array(buffer, offset), n * 2)
  } catch {
    return null
  }
  if (shuffled.byteLength !== n * 2) return null

  // Undo the byte shuffle and the per-row deltas (int16 wrap-around).
  const quantized = new Int16Array(n)
  let i = 0
  for (let f = 0; f < fields.length; f++) {
    for (let r = 0; r < rows; r++) {
      let prev = 0
      for (let c = 0; c < cols; c++, i++) {
        prev = (prev + (shuffled[i] | (shuffled[n + i] << 8))) & 0xffff
        quantized[i] = (prev << 16) >> 16
      }
    }
  }
  return attachFields(parsed, k => quantized[k])
}

// Accepts any wire format. Returns a frame, a Promise of one (GSB2), or null
// for anything unusable.
export function decodeGridMessage(raw) {
  if (raw instanceof ArrayBuffer) {
    const version = raw.byteLength >= 4 ? new Uint8Array(raw, 3, 1)[0] : 0
    return version === 0x32 ? decodeCompressedGridFrame(raw) : decodeGridFrame(raw)
  }
  if (typeof raw !== 'string') return null
  try {
    const value = JSON.parse(raw)
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null
  } catch {
    return null
  }
}
