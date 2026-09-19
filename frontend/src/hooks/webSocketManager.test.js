import assert from 'node:assert/strict'
import test from 'node:test'
import {
  combineSocketStatuses,
  createWebSocketManager,
  reconnectDelay,
} from './webSocketManager.js'

function makeHarness() {
  let clock = 0
  let nextTimer = 1
  let online = true
  let visible = true
  const tasks = new Map()
  const sockets = []
  const statuses = []
  const messages = []
  const windowListeners = new Map()
  const documentListeners = new Map()

  class FakeSocket {
    constructor(url) {
      this.url = url
      this.readyState = 0
      sockets.push(this)
    }
    open() {
      this.readyState = 1
      this.onopen?.()
    }
    message(value) { this.onmessage?.({ data: value }) }
    close() {
      if (this.readyState === 3) return
      this.readyState = 3
      this.onclose?.()
    }
  }

  const schedule = (fn, delay) => {
    const id = nextTimer++
    tasks.set(id, { at: clock + delay, fn })
    return id
  }
  const cancel = id => tasks.delete(id)
  const advance = milliseconds => {
    const target = clock + milliseconds
    while (true) {
      const due = [...tasks.entries()]
        .filter(([, task]) => task.at <= target)
        .sort((a, b) => a[1].at - b[1].at)[0]
      if (!due) break
      const [id, task] = due
      tasks.delete(id)
      clock = task.at
      task.fn()
    }
    clock = target
  }

  const manager = createWebSocketManager({
    url: 'wss://example.test/ws',
    onMessage: value => messages.push(value),
    onStatus: value => statuses.push(value),
    createSocket: url => new FakeSocket(url),
    schedule,
    cancel,
    now: () => clock,
    random: () => 0,
    isOnline: () => online,
    isVisible: () => visible,
    addWindowListener: (name, fn) => windowListeners.set(name, fn),
    removeWindowListener: name => windowListeners.delete(name),
    addDocumentListener: (name, fn) => documentListeners.set(name, fn),
    removeDocumentListener: name => documentListeners.delete(name),
    staleAfterMs: 5_000,
    stableAfterMs: 4_000,
  })

  return {
    manager, sockets, statuses, messages, tasks, advance,
    setOnline(value) { online = value },
    setVisible(value) { visible = value },
    emitWindow(name) { windowListeners.get(name)?.() },
    emitDocument(name) { documentListeners.get(name)?.() },
  }
}

test('backoff grows after short connections and resets only after stability', () => {
  const h = makeHarness()
  h.manager.start()
  assert.equal(h.sockets.length, 1)
  h.sockets[0].open()
  h.sockets[0].message('{}')
  h.sockets[0].close()

  h.advance(999)
  assert.equal(h.sockets.length, 1)
  h.advance(1)
  assert.equal(h.sockets.length, 2)
  h.sockets[1].open()
  h.sockets[1].message('{}')
  h.sockets[1].close()
  h.advance(1_999)
  assert.equal(h.sockets.length, 2)
  h.advance(1)
  assert.equal(h.sockets.length, 3)

  h.sockets[2].open()
  h.sockets[2].message('{}')
  h.advance(4_000)
  h.sockets[2].close()
  h.advance(1_000)
  assert.equal(h.sockets.length, 4)
  h.manager.stop()
})

test('stop detaches callbacks and never schedules another connection', () => {
  const h = makeHarness()
  h.manager.start()
  const socket = h.sockets[0]
  socket.open()
  h.manager.stop()
  socket.close()
  h.advance(60_000)
  assert.equal(h.sockets.length, 1)
  assert.equal(h.tasks.size, 0)
})

test('offline closes without retries and online reconnects immediately', () => {
  const h = makeHarness()
  h.manager.start()
  h.sockets[0].open()
  h.setOnline(false)
  h.emitWindow('offline')
  h.advance(60_000)
  assert.equal(h.sockets.length, 1)
  assert.equal(h.statuses.at(-1), 'offline')

  h.setOnline(true)
  h.emitWindow('online')
  assert.equal(h.sockets.length, 2)
  h.manager.stop()
})

test('hidden tabs defer stale reconnect until visible', () => {
  const h = makeHarness()
  h.manager.start()
  h.sockets[0].open()
  h.sockets[0].message('{"ok":true}')
  h.setVisible(false)
  h.advance(20_000)
  assert.equal(h.sockets.length, 1)

  h.setVisible(true)
  h.emitDocument('visibilitychange')
  assert.equal(h.statuses.at(-1), 'stale')
  h.advance(1_000)
  assert.equal(h.sockets.length, 2)
  h.manager.stop()
})

test('status combination reports the least healthy stream', () => {
  assert.equal(combineSocketStatuses('connected', 'connected'), 'connected')
  assert.equal(combineSocketStatuses('connected', 'connecting'), 'connecting')
  assert.equal(combineSocketStatuses('connected', 'reconnecting'), 'reconnecting')
  assert.equal(combineSocketStatuses('connected', 'stale'), 'stale')
  assert.equal(combineSocketStatuses('connected', 'offline'), 'offline')
  assert.equal(reconnectDelay(99, () => 1), 30_000)
})
