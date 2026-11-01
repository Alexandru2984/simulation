import { useEffect, useState } from 'react'
import { createWebSocketManager } from './webSocketManager'

function websocketUrl(path) {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${protocol}://${window.location.host}${path}`
}

const parseJson = raw => JSON.parse(raw)

// `decode` turns one frame into state, or returns null to ignore it.
export function useResilientWebSocket(path, { decode = parseJson, binary = false } = {}) {
  const [data, setData] = useState(null)
  const [status, setStatus] = useState('connecting')

  useEffect(() => {
    setData(null)
    const manager = createWebSocketManager({
      url: websocketUrl(path),
      onStatus: setStatus,
      createSocket: url => {
        const socket = new WebSocket(url)
        if (binary) socket.binaryType = 'arraybuffer'
        return socket
      },
      onMessage: raw => {
        try {
          const value = decode(raw)
          if (value) setData(value)
        } catch {
          // Ignore malformed application frames; the stale watchdog still
          // verifies whether the transport remains alive.
        }
      },
    })
    manager.start()
    return () => manager.stop()
  }, [path, decode, binary])

  return { data, status }
}
