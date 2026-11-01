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
  await expect(page.getByRole('radio', { name: 'Pressure' }).first()).toHaveAttribute('aria-pressed', 'true')
  await expect(page).toHaveURL(/layer=pressure/)

  expect(errors).toEqual([])
})

test('a shared link restores the layer', async ({ page }) => {
  const errors = watchErrors(page)
  await openApp(page, '#lat=44.43&lon=26.10&layer=humidity')
  await expect(page.getByRole('radio', { name: 'Humidity' }).first()).toHaveAttribute('aria-pressed', 'true')
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
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)

  // "/" focuses the city search.
  await page.keyboard.press('/')
  await expect(page.getByRole('combobox').first()).toBeFocused()

  expect(errors).toEqual([])
})
