import { useSyncExternalStore } from 'react'

// One store per query for the page's lifetime. Stable subscribe/getSnapshot
// functions keep useSyncExternalStore from re-subscribing on every render
// (the app re-renders on each grid frame).
const stores = new Map()

function storeFor(query) {
  let store = stores.get(query)
  if (!store) {
    const list = window.matchMedia(query)
    store = {
      subscribe: callback => {
        list.addEventListener('change', callback)
        return () => list.removeEventListener('change', callback)
      },
      getSnapshot: () => list.matches,
    }
    stores.set(query, store)
  }
  return store
}

const serverSnapshot = () => false

export function useMediaQuery(query) {
  const { subscribe, getSnapshot } = storeFor(query)
  return useSyncExternalStore(subscribe, getSnapshot, serverSnapshot)
}

// Layout tiers used by the HUD; CSS uses the same breakpoints.
export function useLayout() {
  const mobile = useMediaQuery('(max-width: 767px)')
  const tablet = useMediaQuery('(min-width: 768px) and (max-width: 1199px)')
  return mobile ? 'mobile' : tablet ? 'tablet' : 'desktop'
}

export function useReducedMotion() {
  return useMediaQuery('(prefers-reduced-motion: reduce)')
}
