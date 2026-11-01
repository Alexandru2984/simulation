// Decoder for the backend's compact grid stream (/ws/grid?format=bin1).
//
// Layout, little-endian: "GSB1" | u32 headerLength | UTF-8 JSON header |
// zero padding to 4 bytes | int16 values, field-major. The header lists
// [name, scale, offset] per field; value = q / scale + offset.

const FIELD_NAMES = new Set(['T', 'P', 'U', 'V', 'H', 'R', 'SP'])
const MAX_CELLS = 1_000_000
const LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1
const textDecoder = new TextDecoder()

function isPositiveInt(value, max) {
  return Number.isInteger(value) && value > 0 && value <= max
}

export function decodeGridFrame(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 8) return null
  const bytes = new Uint8Array(buffer)
  // "GSB1"
  if (bytes[0] !== 0x47 || bytes[1] !== 0x53 || bytes[2] !== 0x42 || bytes[3] !== 0x31) return null

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
  if (cells > MAX_CELLS || !Array.isArray(fields) || fields.length > 16) return null

  const offset = (8 + headerLength + 3) & ~3
  if (offset + fields.length * cells * 2 > buffer.byteLength) return null

  const frame = { ...header }
  delete frame.fields

  for (let f = 0; f < fields.length; f++) {
    const entry = fields[f]
    if (!Array.isArray(entry) || entry.length !== 3) return null
    const [name, scale, base] = entry
    // Allow-list the names: they become object keys.
    if (!FIELD_NAMES.has(name) || !Number.isFinite(scale) || scale <= 0 ||
        !Number.isFinite(base)) return null

    const start = offset + f * cells * 2
    const values = new Float32Array(cells)
    if (LITTLE_ENDIAN) {
      const quantized = new Int16Array(buffer, start, cells)
      for (let i = 0; i < cells; i++) values[i] = quantized[i] / scale + base
    } else {
      for (let i = 0; i < cells; i++) values[i] = view.getInt16(start + i * 2, true) / scale + base
    }
    frame[name] = values
  }
  return frame
}

// Accepts either wire format; returns null for anything unusable.
export function decodeGridMessage(raw) {
  if (raw instanceof ArrayBuffer) return decodeGridFrame(raw)
  if (typeof raw !== 'string') return null
  try {
    const value = JSON.parse(raw)
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null
  } catch {
    return null
  }
}
