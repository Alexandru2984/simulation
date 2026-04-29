import { useEffect, useRef, useState, useCallback } from 'react'

export function useWeatherSocket() {
  const [data, setData]     = useState(null)
  const [status, setStatus] = useState('connecting')
  const wsRef   = useRef(null)
  const retryRef = useRef(null)

  const connect = useCallback(() => {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${window.location.host}/ws/weather`)
    wsRef.current = ws

    ws.onopen  = () => setStatus('connected')
    ws.onclose = () => {
      setStatus('reconnecting')
      retryRef.current = setTimeout(connect, 3000)
    }
    ws.onerror = () => ws.close()
    ws.onmessage = (e) => {
      try { setData(JSON.parse(e.data)) } catch (_) {}
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
