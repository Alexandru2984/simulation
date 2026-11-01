import { useResilientWebSocket } from './useResilientWebSocket'
import { decodeGridMessage } from '../utils/gridCodec'

const OPTIONS = { decode: decodeGridMessage, binary: true }

// Compact int16 frames (~38 KB) instead of ~90 KB of JSON every second.
export function useGridSocket() {
  return useResilientWebSocket('/ws/grid?format=bin1', OPTIONS)
}
