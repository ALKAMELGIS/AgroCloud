import type { Page } from 'playwright/test'

/** Seed a signed-in admin (the app's localStorage session) and skip the splash screen. */
export async function signInAsAdmin(page: Page) {
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem('agroSplashShown', '1')
      localStorage.setItem(
        'currentUser',
        JSON.stringify({ id: 1, name: 'Test User', email: 'test@example.com', role: 'admin' }),
      )
    } catch {
      /* sandboxed frames (embeds) deny storage — irrelevant to the app under test */
    }
  })
}

/** Collect uncaught page errors (runtime exceptions) for later assertions. */
export function trackPageErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))
  return errors
}

/** Horizontal page overflow in px (0 = no sideways scrolling). */
export function horizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
}
