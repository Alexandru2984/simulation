import { test, expect } from '@playwright/test'
import { clickGlobeCentre, openApp, watchErrors } from './helpers.js'

test('boots on one compressed stream and follows layer shortcuts', async ({ page }) => {
  const errors = watchErrors(page)
  const sockets = []
  const binaryFrame = new Promise(resolve => {
    page.on('websocket', ws => {
      sockets.push(ws.url())
      ws.on('framereceived', frame => { if (typeof frame.payload !== 'string') resolve(frame) })
    })
  })

  await openApp(page)
  const frame = await binaryFrame
  expect(frame.payload.subarray(0, 4).toString('latin1')).toBe('GSB2')
  expect(frame.payload.length).toBeLessThan(12_000)
  // One socket per viewer: the HUD readout rides in the grid frames.
  expect(sockets).toHaveLength(1)
  expect(sockets[0]).toContain('/ws/grid?format=bin2')
  await expect(page.locator('.left-rail')).toContainText('hPa')

  await page.keyboard.press('3')
  await expect(page.getByRole('radio', { name: 'Pressure' }).first()).toHaveAttribute('aria-checked', 'true')
  await expect(page).toHaveURL(/layer=pressure/)

  expect(errors).toEqual([])
})

test('a shared link restores the layer', async ({ page }) => {
  const errors = watchErrors(page)
  await openApp(page, '#lat=44.43&lon=26.10&layer=humidity')
  await expect(page.getByRole('radio', { name: 'Humidity' }).first()).toHaveAttribute('aria-checked', 'true')
  expect(errors).toEqual([])
})

test('clicking the globe compares live observations with the simulation', async ({ page }) => {
  const errors = watchErrors(page)
  await openApp(page, '#lat=44.43&lon=26.10&layer=temp')
  await clickGlobeCentre(page)

  const popup = page.locator('.popup')
  await expect(popup).toBeVisible()
  await expect(popup.locator('.popup__name')).toHaveText('Fakeville')
  await popup.getByRole('button', { name: 'Close weather details' }).click()
  await expect(popup).toHaveCount(0)

  expect(errors).toEqual([])
})

test('an injected cyclone reaches the shared event feed', async ({ page }) => {
  const errors = watchErrors(page)
  await openApp(page, '#lat=20.00&lon=-40.00&layer=pressure')

  const cyclone = page.locator('.event-panel').getByRole('button', { name: 'Cyclone' })
  await cyclone.click()
  await expect(cyclone).toHaveAttribute('aria-pressed', 'true')
  await clickGlobeCentre(page)

  await expect(page.locator('.toast').filter({ hasText: /Cyclone injected/ })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Recent events' }).getByText(/Cyclone/).first()).toBeVisible()
  await expect(cyclone).toHaveAttribute('aria-pressed', 'false')

  expect(errors).toEqual([])
})

test('keyboard: help dialog opens with ? and closes with Escape', async ({ page }) => {
  const errors = watchErrors(page)
  await openApp(page)

  await page.keyboard.press('?')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('link', { name: 'privacy notice' })).toHaveAttribute('href', '/privacy')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)

  // "/" focuses the city search.
  await page.keyboard.press('/')
  await expect(page.getByRole('combobox').first()).toBeFocused()

  expect(errors).toEqual([])
})

test('an uncaught error is reported anonymously, once', async ({ page }) => {
  await openApp(page, '#lat=44.43&lon=26.10&layer=temp')
  const reports = []
  page.on('request', req => {
    if (req.method() === 'POST' && new URL(req.url()).pathname === '/api/client-errors') reports.push(req)
  })
  const first = page.waitForResponse(res => new URL(res.url()).pathname === '/api/client-errors')
  await page.evaluate(() => {
    for (let i = 0; i < 3; i++) setTimeout(() => { throw new TypeError('e2e probe') }, 0)
  })
  expect((await first).status()).toBe(204)
  await page.waitForTimeout(500)

  expect(reports).toHaveLength(1)
  const body = reports[0].postDataJSON()
  expect(body.kind).toBe('error')
  expect(body.message).toBe('TypeError: e2e probe')
  expect(body.build).toMatch(/^index-[\w-]+$/)
  // No viewed coordinates, no page URL, no host name.
  expect(JSON.stringify(body)).not.toMatch(/lat=|lon=|127\.0\.0\.1/)
  expect(reports[0].headers().cookie).toBeUndefined()
})

// lat/lon from the shareable URL, which the globe updates after each move.
const viewFromUrl = url => {
  const hash = new URL(url).hash
  return { lat: Number(hash.match(/lat=(-?[\d.]+)/)[1]), lon: Number(hash.match(/lon=(-?[\d.]+)/)[1]) }
}
const degreesApart = (a, b) => Math.abs(((a - b + 540) % 360) - 180)

test('changing graphics quality rebuilds the globe without moving the camera', async ({ page }) => {
  const errors = watchErrors(page)
  // No idle auto-rotation, and flights land in one frame.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openApp(page, '#lat=44.43&lon=26.10&layer=temp')

  // A fly-to request (as from a shared link), then a move that is not one:
  // "reset view" keeps the longitude and returns to latitude 20.
  // Three decimals: the hash the app writes back after landing has two.
  await page.evaluate(() => { window.location.hash = '#lat=-30.004&lon=140.004&layer=temp' })
  await expect.poll(() => new URL(page.url()).hash).toMatch(/^#lat=-30\.00&lon=140\.00&/)
  await page.keyboard.press('r')
  await expect.poll(() => viewFromUrl(page.url()).lat).toBeCloseTo(20, 0)
  const before = viewFromUrl(page.url())

  // Antialiasing changes, so the canvas is rebuilt from scratch.
  await page.evaluate(() => { window.__oldCanvas = document.querySelector('canvas') })
  await page.getByRole('button', { name: 'Settings' }).first().click()
  await page.getByRole('group', { name: 'Graphics quality' }).getByRole('button', { name: 'Battery saver' }).click()
  await page.keyboard.press('Escape')
  await expect.poll(() => page.evaluate(() => !window.__oldCanvas.isConnected)).toBe(true)
  await expect(page.locator('canvas').first()).toBeVisible()

  // Neither back to the start view nor a repeat of the last fly-to: a zoom
  // step reports where the rebuilt camera is.
  await page.keyboard.press('-')
  await page.waitForTimeout(1_000)
  const after = viewFromUrl(page.url())
  expect(degreesApart(after.lon, before.lon), JSON.stringify({ before, after })).toBeLessThan(1)
  expect(Math.abs(after.lat - before.lat), JSON.stringify({ before, after })).toBeLessThan(1)

  expect(errors).toEqual([])
})
