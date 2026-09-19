export function particleBudgetForFps(fps) {
  if (fps >= 45) return 8192
  if (fps >= 30) return 4096
  if (fps >= 20) return 2048
  return 1024
}

export function createFpsStore({
  sampleMs = 1_000,
  requestFrame = callback => requestAnimationFrame(callback),
  cancelFrame = id => cancelAnimationFrame(id),
} = {}) {
  const listeners = new Set()
  let fps = 60
  let frameRequest = null
  let sampleStartedAt = null
  let frameCount = 0

  const tick = timestamp => {
    frameRequest = null
    if (sampleStartedAt === null) {
      sampleStartedAt = timestamp
      frameCount = 0
    } else {
      frameCount += 1
      const elapsed = timestamp - sampleStartedAt
      if (elapsed >= sampleMs) {
        const nextFps = Math.max(0, Math.round(frameCount * 1_000 / elapsed))
        sampleStartedAt = timestamp
        frameCount = 0
        if (nextFps !== fps) {
          fps = nextFps
          listeners.forEach(listener => listener())
        }
      }
    }

    if (listeners.size > 0) frameRequest = requestFrame(tick)
  }

  const start = () => {
    if (frameRequest !== null) return
    sampleStartedAt = null
    frameCount = 0
    frameRequest = requestFrame(tick)
  }

  const stop = () => {
    if (frameRequest !== null) cancelFrame(frameRequest)
    frameRequest = null
    sampleStartedAt = null
    frameCount = 0
  }

  return {
    getSnapshot: () => fps,
    subscribe(listener) {
      listeners.add(listener)
      if (listeners.size === 1) start()
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) stop()
      }
    },
  }
}

export const sharedFpsStore = createFpsStore()
