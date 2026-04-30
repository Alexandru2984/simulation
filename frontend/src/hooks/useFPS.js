import { useRef, useEffect, useState } from 'react'

export function useFPS(windowMs = 1000) {
  const frames = useRef([])
  const [fps, setFps] = useState(60)

  useEffect(() => {
    let raf
    const tick = (ts) => {
      frames.current.push(ts)
      const cutoff = ts - windowMs
      frames.current = frames.current.filter(t => t >= cutoff)
      setFps(frames.current.length)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [windowMs])

  return fps
}
