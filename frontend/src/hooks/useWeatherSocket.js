import { useResilientWebSocket } from './useResilientWebSocket'

export function useWeatherSocket() {
  return useResilientWebSocket('/ws/weather')
}
