import { test, expect } from '@playwright/test'
import { openApp, watchErrors } from './helpers.js'

// This project runs with a Romanian browser (locale ro-RO); every other
// project uses en-US and checks the English interface.
const ROMANIAN_TITLE = /Simulare meteo/

test('a Romanian browser gets the Romanian interface and number format', async ({ page }) => {
  const errors = watchErrors(page)
  const dictionary = page.waitForResponse(res => /\/assets\/ro-[\w-]+\.js$/.test(res.url()))
  await openApp(page, '#lat=44.43&lon=26.10&layer=temp', { title: ROMANIAN_TITLE })
  expect((await dictionary).ok()).toBe(true)

  await expect(page.locator('html')).toHaveAttribute('lang', 'ro')
  await expect(page.getByRole('radio', { name: 'Presiune' }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Setări' }).first()).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Caută un oraș' })).toBeVisible()
  // Decimal comma in the live statistics.
  await expect(page.locator('.left-rail')).toContainText(/\d,\d°C/)

  await page.keyboard.press('3')
  await expect(page.getByRole('radio', { name: 'Presiune' }).first()).toHaveAttribute('aria-checked', 'true')
  expect(errors).toEqual([])

  // Errors from the API are translated from their stable codes. (The browser
  // logs the deliberate 400, so this runs after the console check.)
  const search = page.getByRole('combobox', { name: 'Caută un oraș' })
  await search.fill('<<script>>')
  await expect(page.locator('.search__results')).toContainText('Folosește litere, spații, virgule sau cratime')
})

test('the language choice in Settings applies at once and is remembered', async ({ page }) => {
  const errors = watchErrors(page)
  await openApp(page, '', { title: ROMANIAN_TITLE })

  await page.getByRole('button', { name: 'Setări' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Setări' })
  await dialog.getByRole('group', { name: 'Limba' }).getByRole('button', { name: 'English' }).click()

  // The open dialog switches language with everything else.
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.getByRole('radio', { name: 'Pressure' }).first()).toBeVisible()
  await page.keyboard.press('Escape')

  await page.reload()
  await openApp(page, '')
  await expect(page.getByRole('radio', { name: 'Pressure' }).first()).toBeVisible()
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('weather-sim:prefs:v1')))
  expect(stored.lang).toBe('en')

  // "Automatic" follows the browser again.
  await page.getByRole('button', { name: 'Settings' }).first().click()
  await page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: 'Automatic' }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'ro')
  await expect(page.getByRole('dialog', { name: 'Setări' })).toBeVisible()

  expect(errors).toEqual([])
})
