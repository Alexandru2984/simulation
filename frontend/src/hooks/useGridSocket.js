import { useEffect, useRef, useState } from 'react'

const WS_URL = (() => {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${window.location.host}/ws/grid`
})()

export function useGridSocket() {
  const [data,   setData]   = useState(null)
  const [status, setStatus] = useState('connecting')
  const wsRef   = useRef(null)
  const retryRef = useRef(null)

  const connect = () => {
    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen    = () => setStatus('connected')
    ws.onclose   = () => {
      setStatus('reconnecting')
      retryRef.current = setTimeout(connect, 3000)
    }
    ws.onerror   = () => ws.close()
    ws.onmessage = (e) => {
      try { setData(JSON.parse(e.data)) } catch (_) {}
    }
  }

  useEffect(() => {
    connect()
    return () => {
      clearTimeout(retryRef.current)
      wsRef.current?.close()
    }
  }, [])

  return { data, status }
}
