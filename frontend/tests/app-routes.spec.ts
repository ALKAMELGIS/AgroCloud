import { expect, test } from 'playwright/test'
import { horizontalOverflow, signInAsAdmin, trackPageErrors } from './helpers/session'

/**
 * Every primary (non-map) page must, on desktop, tablet and mobile:
 *  - render its page heading,
 *  - throw no uncaught runtime errors,
 *  - never scroll the page horizontally.
 * Map workspaces are covered separately (they need WebGL and external tiles).
 */
const ROUTES: { path: string; heading: RegExp }[] = [
  { path: '/', heading: /^(home|الرئيسية)$/i },
  { path: '/dashboards/overview', heading: /dashboard/i },
  { path: '/dashboards/ai-agro-chat', heading: /./ },
  { path: '/dashboards/model', heading: /./ },
  { path: '/ops', heading: /operations forms/i },
  { path: '/ops/harvest', heading: /harvest record/i },
  { path: '/ops/ec_ph', heading: /ec/i },
  { path: '/ops/settings', heading: /settings/i },
  { path: '/data/qhis', heading: /./ },
  { path: '/master/gis-content', heading: /./ },
  { path: '/master/dashboard-settings', heading: /dashboard settings/i },
  { path: '/account/profile', heading: /profile/i },
  { path: '/account/settings', heading: /./ },
  { path: '/admin/users', heading: /user management/i },
  { path: '/admin/roles', heading: /./ },
  { path: '/admin/manpower', heading: /./ },
  { path: '/admin/github', heading: /github/i },
  { path: '/admin/system-settings', heading: /system settings/i },
  { path: '/style-guide', heading: /design system/i },
]

test.describe('primary pages', () => {
  for (const route of ROUTES) {
    test(`${route.path} renders without errors or sideways scroll`, async ({ page }) => {
      await signInAsAdmin(page)
      const errors = trackPageErrors(page)
      await page.goto(`/AgroCloud/#${route.path}`)

      const heading = page.locator('h1').first()
      await expect(heading).toBeVisible()
      await expect(heading).toHaveText(route.heading)

      expect(await horizontalOverflow(page), 'page must not scroll horizontally').toBeLessThanOrEqual(1)
      expect(errors, 'no uncaught runtime errors').toEqual([])
    })
  }
})

test('login page renders for signed-out visitors', async ({ page }) => {
  const errors = trackPageErrors(page)
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem('agroSplashShown', '1')
    } catch {
      /* ignore */
    }
  })
  await page.goto('/AgroCloud/#/login')
  await expect(page.getByRole('button', { name: /sign in/i }).first()).toBeVisible()
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1)
  expect(errors).toEqual([])
})
