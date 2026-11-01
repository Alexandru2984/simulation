import { useEffect, useState } from 'react'
import { createWebSocketManager } from './webSocketManager'

function websocketUrl(path) {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${protocol}://${window.location.host}${path}`
}

const parseJson = raw => JSON.parse(raw)

// `decode` turns one frame into state (or a Promise of it), or returns null
// to ignore it. Async results are applied strictly in arrival order.
export function useResilientWebSocket(path, { decode = parseJson, binary = false } = {}) {
  const [data, setData] = useState(null)
  const [status, setStatus] = useState('connecting')

  useEffect(() => {
    setData(null)
    let active = true
    let pending = Promise.resolve()
    const apply = value => { if (active && value) setData(value) }
    const manager = createWebSocketManager({
      url: websocketUrl(path),
      onStatus: setStatus,
      createSocket: url => {
        const socket = new WebSocket(url)
        if (binary) socket.binaryType = 'arraybuffer'
        return socket
      },
      onMessage: raw => {
        // Ignore malformed application frames; the stale watchdog still
        // verifies whether the transport remains alive.
        let value
        try {
          value = decode(raw)
        } catch {
          return
        }
        if (value && typeof value.then === 'function') {
          pending = pending.then(() => value).then(apply, () => {})
        } else {
          pending = pending.then(() => apply(value))
        }
      },
    })
    manager.start()
    return () => {
      active = false
      manager.stop()
    }
  }, [path, decode, binary])

  return { data, status }
}
