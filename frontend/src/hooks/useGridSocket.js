import { useResilientWebSocket } from './useResilientWebSocket'
import { decodeGridMessage, supportsCompressedFrames } from '../utils/gridCodec'
import { reportError } from '../utils/errorReporter'

// Compressed frames (~7.5 KB/s) where the browser can inflate them natively,
// plain int16 frames (~37 KB/s) otherwise; JSON would be ~80 KB/s.
const FORMAT = supportsCompressedFrames() ? 'bin2' : 'bin1'
const PATH = `/ws/grid?format=${FORMAT}`

// A frame the browser cannot decode leaves the globe frozen with no visible
// error, so it is reported (once per page load; see errorReporter.js).
function reportUndecodable(raw) {
  const type = raw instanceof ArrayBuffer ? 'binary' : 'text'
  reportError('stream', `Grid ${type} frame could not be decoded (format=${FORMAT})`)
}

function decode(raw) {
  const result = decodeGridMessage(raw)
  if (result && typeof result.then === 'function') {
    return result.then(frame => {
      if (!frame) reportUndecodable(raw)
      return frame
    })
  }
  if (!result) reportUndecodable(raw)
  return result
}

const OPTIONS = { decode, binary: true }

export function useGridSocket() {
  return useResilientWebSocket(PATH, OPTIONS)
}
