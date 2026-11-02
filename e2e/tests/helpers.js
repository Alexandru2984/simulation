import { expect } from '@playwright/test'

// Collects console errors and uncaught exceptions; tests assert it stays empty.
export function watchErrors(page) {
  const errors = []
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()) })
  page.on('pageerror', err => errors.push(`pageerror: ${err.message}`))
  return errors
}

// Opens the app and waits until the live stream is connected and the 3D
// globe is on screen (not the no-WebGL fallback). `title` is the document
// title to expect, for runs in another interface language.
export async function openApp(page, hash = '', { title = /Weather Simulation/ } = {}) {
  await page.goto(`/${hash}`)
  await expect(page).toHaveTitle(title)
  await expect(page.locator('.splash')).toHaveClass(/is-hidden/, { timeout: 45_000 })
  await expect(page.locator('.globe-fallback')).toHaveCount(0)
  await expect(page.locator('canvas').first()).toBeVisible()
  await expect(page.locator('.status').first()).toHaveText(/Live/)
}

// Clicks the centre of the globe (the camera always looks at its centre).
export async function clickGlobeCentre(page) {
  const box = await page.locator('canvas').first().boundingBox()
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
}

// Taps the centre of the globe on touch devices.
export async function tapGlobeCentre(page) {
  const box = await page.locator('canvas').first().boundingBox()
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
}
