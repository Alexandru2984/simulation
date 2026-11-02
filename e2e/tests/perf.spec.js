import { expect, test } from '@playwright/test'
import { openApp, watchErrors } from './helpers.js'

// Runtime budget through the production nginx vhost (gzip, cache headers).
// Only deterministic quantities are gated. Paint and boot times are printed
// for the CI log but not enforced: CI renders WebGL in software, so its GPU
// process delays every frame by an amount that varies run to run (first paint
// measured anywhere from 0.6 s to 5 s on the same build). The build-time
// budget is frontend/scripts/check-budget.mjs.
const KB = 1000
const BUDGET = {
  firstVisitBytes: 800 * KB,     // everything until the stream is live
  firstVisitRequests: 25,
  repeatVisitBytes: 20 * KB,     // hashed bundles and textures come from cache
  cumulativeLayoutShift: 0.05,
  streamBytesPerSecond: 12 * KB, // one compressed GSB2 frame per second
}

// Observers registered before any page script runs.
const OBSERVE = () => {
  window.__perf = { cls: 0, fcp: null }
  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__perf.cls += entry.value
  }).observe({ type: 'layout-shift', buffered: true })
  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) if (entry.name === 'first-contentful-paint') window.__perf.fcp = entry.startTime
  }).observe({ type: 'paint', buffered: true })
}

const transferred = page => page.evaluate(() => {
  const entries = [...performance.getEntriesByType('navigation'), ...performance.getEntriesByType('resource')]
  return {
    bytes: entries.reduce((sum, e) => sum + (e.transferSize || 0), 0),
    requests: entries.length,
    origins: [...new Set(entries.map(e => new URL(e.name).origin))],
    largest: [...entries].sort((a, b) => b.transferSize - a.transferSize).slice(0, 5)
      .map(e => `${new URL(e.name).pathname} ${(e.transferSize / 1000).toFixed(1)} KB`),
  }
})

test('the splash is static HTML, painted without waiting for JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  await page.goto('/')
  await expect(page.locator('.splash h1')).toHaveText('Weather Simulation')
  await expect(page.locator('.splash')).toBeVisible()
  // Nothing but the stylesheet may block rendering.
  const blocking = await page.locator('head script[src]:not([type="module"]):not([async]):not([defer])').count()
  expect(blocking).toBe(0)
  expect(await page.locator('head link[rel="stylesheet"]').count()).toBe(1)
  await context.close()
})

test('first and repeat visits stay within the budget', async ({ page, baseURL }) => {
  const errors = watchErrors(page)
  await page.addInitScript(OBSERVE)

  const started = Date.now()
  await openApp(page, '#lat=44.43&lon=26.10&layer=temp')
  const timeToLive = Date.now() - started
  await page.waitForLoadState('networkidle')
  const first = await transferred(page)
  const { cls, fcp } = await page.evaluate(() => window.__perf)

  console.log(`first visit: ${(first.bytes / KB).toFixed(1)} KB in ${first.requests} requests, CLS ${cls.toFixed(3)}`)
  console.log(`  largest: ${first.largest.join(', ')}`)
  console.log(`  not gated (software WebGL): first paint ${fcp?.toFixed(0)} ms, live after ${timeToLive} ms`)
  expect(first.origins, 'no third-party requests').toEqual([new URL(baseURL).origin])
  expect(first.bytes, first.largest.join(', ')).toBeLessThanOrEqual(BUDGET.firstVisitBytes)
  expect(first.requests).toBeLessThanOrEqual(BUDGET.firstVisitRequests)
  expect(cls).toBeLessThanOrEqual(BUDGET.cumulativeLayoutShift)

  // A normal navigation back to the app: immutable bundles and week-long
  // textures must not be downloaded again.
  await page.goto('about:blank')
  await openApp(page, '#lat=44.43&lon=26.10&layer=temp')
  await page.waitForLoadState('networkidle')
  const repeat = await transferred(page)
  console.log(`repeat visit: ${(repeat.bytes / KB).toFixed(1)} KB`)
  expect(repeat.bytes, repeat.largest.join(', ')).toBeLessThanOrEqual(BUDGET.repeatVisitBytes)

  expect(errors).toEqual([])
})

test('the live stream costs about one compressed frame per second', async ({ page }) => {
  let bytes = 0
  let counting = false
  page.on('websocket', ws => ws.on('framereceived', frame => {
    if (counting) bytes += frame.payload.length
  }))
  await openApp(page)
  counting = true
  const seconds = 6
  await page.waitForTimeout(seconds * 1000)
  counting = false
  const rate = bytes / seconds
  console.log(`stream: ${(rate / KB).toFixed(1)} KB/s`)
  expect(rate).toBeGreaterThan(0)
  expect(rate).toBeLessThanOrEqual(BUDGET.streamBytesPerSecond)
})
