import { useEffect, useState } from 'react'
import { createWebSocketManager } from './webSocketManager'

function websocketUrl(path) {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${protocol}://${window.location.host}${path}`
}

export function useResilientWebSocket(path) {
  const [data, setData] = useState(null)
  const [status, setStatus] = useState('connecting')

  useEffect(() => {
    setData(null)
    const manager = createWebSocketManager({
      url: websocketUrl(path),
      onStatus: setStatus,
      onMessage: raw => {
        try { setData(JSON.parse(raw)) } catch {
          // Ignore malformed application frames; the stale watchdog still
          // verifies whether the transport remains alive.
        }
      },
    })
    manager.start()
    return () => manager.stop()
  }, [path])

  return { data, status }
}
