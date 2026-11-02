const CONNECTING = 0
const OPEN = 1
// RFC 6455 registry: "Try Again Later". The backend sends it when every
// viewer slot is taken.
export const CLOSE_TRY_AGAIN_LATER = 1013
// When the server is full, wait at least this many backoff steps (~8 s).
const FULL_MIN_ATTEMPT = 3

export function reconnectDelay(attempt, random = Math.random) {
  const base = Math.min(30_000, 1_000 * (2 ** Math.max(0, attempt)))
  const jitter = Math.floor(random() * Math.min(1_000, base * 0.25))
  return Math.min(30_000, base + jitter)
}

export function createWebSocketManager({
  url,
  onMessage,
  onStatus,
  staleAfterMs = 12_000,
  stableAfterMs = 10_000,
  // Background tabs give their slot and bandwidth back after this long and
  // reconnect as soon as they are visible again.
  pauseHiddenAfterMs = 60_000,
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
  let pauseTimer = null
  // Set by a 1013 close, cleared by the first frame of a later connection.
  let serverFull = false

  const clearTimer = (name) => {
    const id = name === 'reconnect'
      ? reconnectTimer
      : name === 'stable' ? stableTimer : name === 'pause' ? pauseTimer : staleTimer
    if (id !== null) cancel(id)
    if (name === 'reconnect') reconnectTimer = null
    else if (name === 'stable') stableTimer = null
    else if (name === 'pause') pauseTimer = null
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
      serverFull = false
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

    nextSocket.onclose = event => {
      if (stopped || token !== generation) return
      socket = null
      clearConnectionTimers()
      if (event?.code === CLOSE_TRY_AGAIN_LATER) {
        serverFull = true
        reconnectAttempt = Math.max(reconnectAttempt, FULL_MIN_ATTEMPT)
        scheduleReconnect('full')
        return
      }
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

  // A full server keeps its backoff: coming back online or to the tab must
  // not let every waiting viewer retry at the same moment.
  const resumeWhileFull = () => {
    if (!serverFull) return false
    if (reconnectTimer === null) scheduleReconnect('full')
    return true
  }

  const handleOnline = () => {
    if (stopped || resumeWhileFull()) return
    reconnectAttempt = 0
    connect()
  }

  const pauseWhileHidden = () => {
    pauseTimer = null
    if (stopped || isVisible()) return
    clearTimer('reconnect')
    detachAndClose()
    // Shown only once the tab is visible again, right before reconnecting.
    onStatus('connecting')
  }

  const handleVisibility = () => {
    if (stopped) return
    if (!isVisible()) {
      if (pauseTimer === null && pauseHiddenAfterMs > 0)
        pauseTimer = schedule(pauseWhileHidden, pauseHiddenAfterMs)
      return
    }
    clearTimer('pause')
    if (!socketIsActive()) {
      if (resumeWhileFull()) return
      reconnectAttempt = 0
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
      clearTimer('pause')
      detachAndClose()
      removeWindowListener('offline', handleOffline)
      removeWindowListener('online', handleOnline)
      removeDocumentListener('visibilitychange', handleVisibility)
    },
  }
}
