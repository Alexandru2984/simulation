import { useCallback, useEffect, useState } from 'react'

export function useFullscreen() {
  const supported = typeof document !== 'undefined' &&
    Boolean(document.fullscreenEnabled || document.webkitFullscreenEnabled)
  const current = () => Boolean(document.fullscreenElement || document.webkitFullscreenElement)
  const [active, setActive] = useState(() => (supported ? current() : false))

  useEffect(() => {
    if (!supported) return undefined
    const onChange = () => setActive(current())
    document.addEventListener('fullscreenchange', onChange)
    document.addEventListener('webkitfullscreenchange', onChange)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      document.removeEventListener('webkitfullscreenchange', onChange)
    }
  }, [supported])

  const toggle = useCallback(() => {
    if (!supported) return
    const root = document.documentElement
    if (current()) (document.exitFullscreen || document.webkitExitFullscreen)?.call(document)
    else (root.requestFullscreen || root.webkitRequestFullscreen)?.call(root)?.catch?.(() => {})
  }, [supported])

  return { supported, active, toggle }
}
