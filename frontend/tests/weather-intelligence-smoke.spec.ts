import { expect, test } from 'playwright/test'

test.describe('Weather Intelligence smoke', () => {
  test('Home weather icon opens intelligence dashboard', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'currentUser',
        JSON.stringify({ id: 1, name: 'Test User', email: 'test@example.com', role: 'admin' }),
      )
    })

    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/', { waitUntil: 'domcontentloaded' })

    const weatherCard = page.getByRole('button', { name: /Weather|الطقس/i })
    await expect(weatherCard).toBeVisible()
    await weatherCard.click()

    await expect(page).toHaveURL(/\/weather\/intelligence/)
    await expect(page.locator('.weather-shell')).toBeVisible()
    await expect(page.getByRole('heading', { name: /AgroCloud.*Weather/i })).toBeVisible()
  })
})
