import { useSyncExternalStore } from 'react'

function subscribeTo(query) {
  return callback => {
    const list = window.matchMedia(query)
    list.addEventListener('change', callback)
    return () => list.removeEventListener('change', callback)
  }
}

export function useMediaQuery(query) {
  return useSyncExternalStore(
    subscribeTo(query),
    () => window.matchMedia(query).matches,
    () => false,
  )
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
