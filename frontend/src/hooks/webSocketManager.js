const CONNECTING = 0
const OPEN = 1

export function reconnectDelay(attempt, random = Math.random) {
  const base = Math.min(30_000, 1_000 * (2 ** Math.max(0, attempt)))
  const jitter = Math.floor(random() * Math.min(1_000, base * 0.25))
  return Math.min(30_000, base + jitter)
}

export function combineSocketStatuses(...statuses) {
  if (statuses.includes('offline')) return 'offline'
  if (statuses.includes('stale')) return 'stale'
  if (statuses.includes('reconnecting')) return 'reconnecting'
  if (statuses.includes('connecting')) return 'connecting'
  return statuses.every(status => status === 'connected') ? 'connected' : 'reconnecting'
}

export function createWebSocketManager({
  url,
  onMessage,
  onStatus,
  staleAfterMs = 12_000,
  stableAfterMs = 10_000,
  createSocket = value => new WebSocket(value),
  schedule = (fn, delay) => window.setTimeout(fn, delay),
  cancel = id => window.clearTimeout(id),
  now = () => Date.now(),
  random = Math.random,
  isOnline = () => navigator.onLine !== false,
  isVisible = () => document.visibilityState !== 'hidden',
  addWindowListener = (name, fn) => window.addEventListener(name, fn),
  removeWindowListener = (name, fn) => window.removeEventListener(name, fn),
  addDocumentListener = (name, fn) => document.addEventListener(name, fn),
  removeDocumentListener = (name, fn) => document.removeEventListener(name, fn),
}) {
  let stopped = true
  let socket = null
  let generation = 0
  let reconnectAttempt = 0
  let reconnectTimer = null
  let stableTimer = null
  let staleTimer = null
  let lastMessageAt = null
  let staleGeneration = 0

  const clearTimer = (name) => {
    const id = name === 'reconnect'
      ? reconnectTimer
      : name === 'stable' ? stableTimer : staleTimer
    if (id !== null) cancel(id)
    if (name === 'reconnect') reconnectTimer = null
    else if (name === 'stable') stableTimer = null
    else staleTimer = null
  }

  const clearConnectionTimers = () => {
    clearTimer('stable')
    clearTimer('stale')
  }

  const socketIsActive = () => socket &&
    (socket.readyState === CONNECTING || socket.readyState === OPEN)

  const detachAndClose = () => {
    const current = socket
    socket = null
    generation += 1
    clearConnectionTimers()
    if (!current) return
    current.onopen = null
    current.onmessage = null
    current.onerror = null
    current.onclose = null
    if (current.readyState === CONNECTING || current.readyState === OPEN)
      current.close()
  }

  const checkStale = (token) => {
    staleTimer = null
    if (stopped || token !== generation || !socketIsActive()) return
    if (!isVisible()) {
      armStaleTimer(token)
      return
    }
    const remaining = staleAfterMs - (now() - lastMessageAt)
    if (remaining > 0) {
      staleTimer = schedule(() => checkStale(token), remaining)
      return
    }
    staleGeneration = token
    onStatus('stale')
    socket.close()
  }

  const armStaleTimer = (token) => {
    clearTimer('stale')
    staleTimer = schedule(() => checkStale(token), staleAfterMs)
  }

  const armStableTimer = (token) => {
    if (stableTimer !== null) return
    stableTimer = schedule(() => {
      stableTimer = null
      if (!stopped && token === generation && socketIsActive())
        reconnectAttempt = 0
    }, stableAfterMs)
  }

  const connect = () => {
    clearTimer('reconnect')
    if (stopped || socketIsActive()) return
    if (!isOnline()) {
      onStatus('offline')
      return
    }
    if (!isVisible()) {
      onStatus('reconnecting')
      return
    }

    onStatus(reconnectAttempt === 0 ? 'connecting' : 'reconnecting')
    const token = ++generation
    let nextSocket
    try {
      nextSocket = createSocket(url)
    } catch {
      nextSocket = null
    }

    if (!nextSocket) {
      scheduleReconnect()
      return
    }
    socket = nextSocket

    nextSocket.onopen = () => {
      if (stopped || token !== generation) return
      lastMessageAt = now()
      onStatus('connected')
      armStaleTimer(token)
    }

    nextSocket.onmessage = event => {
      if (stopped || token !== generation) return
      lastMessageAt = now()
      armStaleTimer(token)
      armStableTimer(token)
      try { onMessage(event.data) } catch {
        // Consumers validate payloads; one bad frame must not break liveness.
      }
    }

    nextSocket.onerror = () => {
      if (!stopped && token === generation) nextSocket.close()
    }

    nextSocket.onclose = () => {
      if (stopped || token !== generation) return
      socket = null
      clearConnectionTimers()
      scheduleReconnect(token === staleGeneration ? 'stale' : 'reconnecting')
    }
  }

  function scheduleReconnect(nextStatus = 'reconnecting') {
    if (stopped) return
    if (!isOnline()) {
      onStatus('offline')
      return
    }
    onStatus(nextStatus)
    if (!isVisible()) return
    clearTimer('reconnect')
    const delay = reconnectDelay(reconnectAttempt, random)
    reconnectAttempt += 1
    reconnectTimer = schedule(connect, delay)
  }

  const handleOffline = () => {
    if (stopped) return
    clearTimer('reconnect')
    detachAndClose()
    onStatus('offline')
  }

  const handleOnline = () => {
    if (stopped) return
    reconnectAttempt = 0
    connect()
  }

  const handleVisibility = () => {
    if (stopped || !isVisible()) return
    if (!socketIsActive()) {
      connect()
      return
    }
    if (lastMessageAt !== null && now() - lastMessageAt >= staleAfterMs) {
      staleGeneration = generation
      onStatus('stale')
      socket.close()
    }
  }

  return {
    start() {
      if (!stopped) return
      stopped = false
      addWindowListener('offline', handleOffline)
      addWindowListener('online', handleOnline)
      addDocumentListener('visibilitychange', handleVisibility)
      connect()
    },
    stop() {
      if (stopped) return
      stopped = true
      clearTimer('reconnect')
      detachAndClose()
      removeWindowListener('offline', handleOffline)
      removeWindowListener('online', handleOnline)
      removeDocumentListener('visibilitychange', handleVisibility)
    },
  }
}
