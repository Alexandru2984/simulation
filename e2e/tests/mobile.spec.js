import { test, expect } from '@playwright/test'
import { openApp, watchErrors } from './helpers.js'

test('phone layout: bottom sheet opens and closes, nothing overflows', async ({ page }) => {
  const errors = watchErrors(page)
  await openApp(page)

  const sheet = page.locator('.sheet')
  await expect(sheet).toBeVisible()
  await expect(sheet).not.toHaveClass(/is-open/)

  await page.getByRole('button', { name: 'Expand controls' }).tap()
  await expect(sheet).toHaveClass(/is-open/)
  await expect(sheet.getByRole('heading', { name: 'Live statistics' })).toBeVisible()

  await page.getByRole('button', { name: 'Collapse controls' }).tap()
  await expect(sheet).not.toHaveClass(/is-open/)

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)

  expect(errors).toEqual([])
})

test('phone layout: city search flies to the result and shows its weather', async ({ page }) => {
  const errors = watchErrors(page)
  await openApp(page)

  await page.getByRole('button', { name: 'Search for a city' }).tap()
  const input = page.locator('.mobile-search').getByRole('combobox')
  await expect(input).toBeFocused()
  await input.fill('bucuresti')
  const option = page.getByRole('option', { name: /Bucuresti/ }).first()
  await expect(option).toBeVisible()
  await option.tap()

  await expect(page.locator('.mobile-search')).toHaveCount(0)
  await expect(page.locator('.popup')).toBeVisible()

  expect(errors).toEqual([])
})
