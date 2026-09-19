import { useSyncExternalStore } from 'react'
import { sharedFpsStore } from './fpsStore'

export function useFPS() {
  return useSyncExternalStore(
    sharedFpsStore.subscribe,
    sharedFpsStore.getSnapshot,
    sharedFpsStore.getSnapshot,
  )
}
