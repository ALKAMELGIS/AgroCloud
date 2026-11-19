import { test, expect } from 'playwright/test'

test('settings page shows advanced data source multi-select UI', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('agroSplashShown', '1')
    localStorage.setItem(
      'currentUser',
      JSON.stringify({ id: 1, name: 'Admin', email: 'admin@example.com', role: 'Admin' })
    )
  })

  await page.goto('/AgroCloud/#/account/settings')

  // Page heading (formerly "Workflow & Data Sources").
  await expect(page.getByRole('heading', { level: 1, name: /Data Management/i })).toBeVisible()

  // "Configure Fields" must open the configuration, never toggle an open one closed.
  await page.getByRole('button', { name: /Configure Fields/i }).click()
  await expect(page.locator('#open-fields-btn')).toHaveAttribute('aria-expanded', 'true')

  await expect(page.getByRole('textbox', { name: 'Search available layers' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Select all filtered' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Clear all filtered' })).toBeVisible()
})
