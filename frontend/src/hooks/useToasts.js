import { useCallback, useEffect, useRef, useState } from 'react'

const TONES = {
  success: '#22c55e',
  info: '#38bdf8',
  event: '#a855f7',
  warning: '#f59e0b',
  error: '#f87171',
}

let nextId = 1

export function useToasts({ max = 3, duration = 3500 } = {}) {
  const [toasts, setToasts] = useState([])
  const timers = useRef(new Map())

  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach(clearTimeout)
  }, [])

  const dismiss = useCallback(id => {
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    setToasts(list => list.filter(t => t.id !== id))
  }, [])

  const notify = useCallback((message, tone = 'success') => {
    const id = nextId++
    setToasts(list => [...list.slice(-(max - 1)), { id, message, color: TONES[tone] ?? tone }])
    timers.current.set(id, setTimeout(() => dismiss(id), duration))
  }, [dismiss, duration, max])

  return { toasts, notify, dismiss }
}
