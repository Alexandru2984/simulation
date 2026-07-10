import { useCallback, useEffect, useRef, useState } from 'react'

const WS_URL = (() => {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${window.location.host}/ws/grid`
})()

export function useGridSocket() {
  const [data,   setData]   = useState(null)
  const [status, setStatus] = useState('connecting')
  const wsRef   = useRef(null)
  const retryRef = useRef(null)
  const delayRef = useRef(3000)

  const connect = useCallback(() => {
    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen    = () => {
      delayRef.current = 3000
      setStatus('connected')
    }
    ws.onclose   = () => {
      setStatus('reconnecting')
      // Exponential backoff with jitter, capped at 30s
      const delay = delayRef.current
      delayRef.current = Math.min(delay * 2, 30000)
      retryRef.current = setTimeout(connect, delay + Math.random() * 1000)
    }
    ws.onerror   = () => ws.close()
    ws.onmessage = (e) => {
      try { setData(JSON.parse(e.data)) } catch {
        // Ignore malformed websocket frames.
      }
    }
  }, [])

  useEffect(() => {
    connect()
    return () => {
      clearTimeout(retryRef.current)
      wsRef.current?.close()
    }
  }, [connect])

  return { data, status }
}
