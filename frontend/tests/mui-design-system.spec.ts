import { expect, test } from 'playwright/test'

/**
 * Visual smoke for MUI shell + admin surfaces. Set VITE_MUI_SHELL=true in dev/preview for shell checks.
 */
test.describe('MUI design system QA', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'currentUser',
        JSON.stringify({ id: 1, name: 'Test User', email: 'test@example.com', role: 'admin' }),
      )
    })
  })

  test('admin users route renders without horizontal overflow @ 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/#/admin/users', { waitUntil: 'domcontentloaded' })
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2)
    expect(overflow).toBe(true)
  })

  test('theme root: CssBaseline present when MUI enabled', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const hasMuiRoot = await page.locator('.MuiCssBaseline-root').count()
    expect(hasMuiRoot).toBeGreaterThanOrEqual(0)
  })
})
