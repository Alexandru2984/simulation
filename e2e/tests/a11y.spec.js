import AxeBuilder from '@axe-core/playwright'
import { devices, expect, test } from '@playwright/test'
import { clickGlobeCentre, openApp } from './helpers.js'

// WCAG 2.1 A/AA rules from axe-core on every screen a visitor can reach.
// The globe itself is a canvas (axe cannot see into it); everything around it
// — HUD, dialogs, bottom sheet, static pages — must pass.
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']

async function audit(page, include) {
  let builder = new AxeBuilder({ page }).withTags(TAGS)
  if (include) builder = builder.include(include)
  const { violations } = await builder.analyze()
  const report = violations.map(v =>
    `${v.impact} ${v.id}: ${v.help}\n${v.nodes.slice(0, 4).map(n => `    ${n.target.join(' ')} — ${n.failureSummary?.split('\n')[1]?.trim() ?? ''}`).join('\n')}`)
  expect(report, report.join('\n\n')).toEqual([])
}

test.describe('desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('the app shell and HUD', async ({ page }) => {
    await openApp(page, '#lat=44.43&lon=26.10&layer=temp')
    await audit(page)
  })

  test('the help and settings dialogs', async ({ page }) => {
    await openApp(page)
    await page.keyboard.press('?')
    await expect(page.getByRole('dialog')).toBeVisible()
    await audit(page, '[role="dialog"]')
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: 'Settings' }).first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await audit(page, '[role="dialog"]')
  })

  test('the event injector, time navigator and weather popup', async ({ page }) => {
    await openApp(page, '#lat=44.43&lon=26.10&layer=temp')
    // The injector starts open on desktop.
    await expect(page.locator('.event-panel')).toBeVisible()
    await audit(page, '.event-panel')

    await page.locator('.time-tabs').getByRole('button').first().click()
    await expect(page.locator('.time-panel')).toBeVisible()
    await audit(page, '.time-dock')

    await clickGlobeCentre(page)
    await expect(page.locator('.popup__name')).toHaveText('Fakeville')
    await audit(page, '.popup')
  })

  test('the layer picker is one tab stop driven by arrow keys', async ({ page }) => {
    await openApp(page, '#lat=44.43&lon=26.10&layer=temp')
    const group = page.getByRole('radiogroup', { name: 'Map layer' }).first()
    const temp = group.getByRole('radio', { name: 'Temp' })
    await expect(group.locator('[role="radio"][tabindex="0"]')).toHaveCount(1)
    await temp.focus()
    await page.keyboard.press('ArrowRight')
    const pressure = group.getByRole('radio', { name: 'Pressure' })
    await expect(pressure).toHaveAttribute('aria-checked', 'true')
    await expect(pressure).toBeFocused()
    await expect(page).toHaveURL(/layer=pressure/)
    await page.keyboard.press('Home')
    await expect(group.getByRole('radio').first()).toHaveAttribute('aria-checked', 'true')
  })

  test('the privacy notice in both languages and the 404 page', async ({ page }) => {
    await page.goto('/privacy')
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: 'Confidențialitate' })).toBeHidden()
    await audit(page)
    // The language switch works without JavaScript (:target).
    await page.getByRole('link', { name: 'Română' }).click()
    await expect(page).toHaveURL(/#ro$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Confidențialitate' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeHidden()
    await audit(page)
    await page.goto('/no-such-page')
    await audit(page)
  })
})

test.describe('phone', () => {
  // Pixel 7 without the browser choice, which cannot change inside a file.
  const { defaultBrowserType: _browser, ...pixel } = devices['Pixel 7']
  test.use(pixel)

  test('the phone layout and its bottom sheet', async ({ page }) => {
    await openApp(page, '#lat=44.43&lon=26.10&layer=temp')
    await audit(page)
    await page.getByRole('button', { name: 'Expand controls' }).tap()
    await expect(page.locator('.sheet')).toHaveClass(/is-open/)
    await audit(page)
  })
})
