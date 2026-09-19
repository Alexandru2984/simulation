import assert from 'node:assert/strict'
import test from 'node:test'
import { createFpsStore, particleBudgetForFps } from './fpsStore.js'

function makeFrameScheduler() {
  let nextId = 1
  const callbacks = new Map()
  return {
    request(callback) {
      const id = nextId++
      callbacks.set(id, callback)
      return id
    },
    cancel(id) { callbacks.delete(id) },
    step(timestamp) {
      const entry = callbacks.entries().next().value
      assert.ok(entry, 'a frame must be scheduled')
      const [id, callback] = entry
      callbacks.delete(id)
      callback(timestamp)
    },
    pending: () => callbacks.size,
  }
}

test('all consumers share one animation-frame sampler', () => {
  const frames = makeFrameScheduler()
  const store = createFpsStore({
    requestFrame: callback => frames.request(callback),
    cancelFrame: id => frames.cancel(id),
  })

  const unsubscribeA = store.subscribe(() => {})
  const unsubscribeB = store.subscribe(() => {})
  const unsubscribeC = store.subscribe(() => {})
  assert.equal(frames.pending(), 1)

  unsubscribeA()
  unsubscribeB()
  assert.equal(frames.pending(), 1)
  unsubscribeC()
  assert.equal(frames.pending(), 0)
})

test('fps is published once per sample instead of every frame', () => {
  const frames = makeFrameScheduler()
  const store = createFpsStore({
    sampleMs: 1_000,
    requestFrame: callback => frames.request(callback),
    cancelFrame: id => frames.cancel(id),
  })
  let updates = 0
  const unsubscribe = store.subscribe(() => { updates += 1 })

  for (let timestamp = 0; timestamp <= 1_000; timestamp += 100)
    frames.step(timestamp)

  assert.equal(store.getSnapshot(), 10)
  assert.equal(updates, 1)
  unsubscribe()
})

test('particle budgets degrade at explicit fps thresholds', () => {
  assert.equal(particleBudgetForFps(60), 8192)
  assert.equal(particleBudgetForFps(45), 8192)
  assert.equal(particleBudgetForFps(44), 4096)
  assert.equal(particleBudgetForFps(29), 2048)
  assert.equal(particleBudgetForFps(19), 1024)
})
