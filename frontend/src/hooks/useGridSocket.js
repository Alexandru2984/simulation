import { useResilientWebSocket } from './useResilientWebSocket'
import { decodeGridMessage, supportsCompressedFrames } from '../utils/gridCodec'

const OPTIONS = { decode: decodeGridMessage, binary: true }
// Compressed frames (~7.5 KB/s) where the browser can inflate them natively,
// plain int16 frames (~37 KB/s) otherwise; JSON would be ~80 KB/s.
const PATH = supportsCompressedFrames() ? '/ws/grid?format=bin2' : '/ws/grid?format=bin1'

export function useGridSocket() {
  return useResilientWebSocket(PATH, OPTIONS)
}
