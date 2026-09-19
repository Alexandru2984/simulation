import { useResilientWebSocket } from './useResilientWebSocket'

export function useGridSocket() {
  return useResilientWebSocket('/ws/grid')
}
