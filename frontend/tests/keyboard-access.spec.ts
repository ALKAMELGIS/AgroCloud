import { expect, test } from 'playwright/test'
import { signInAsAdmin } from './helpers/session'

test.describe('keyboard access', () => {
  test.skip(({ isMobile }) => isMobile, 'keyboard navigation is a desktop concern')

  test('first Tab reaches "Skip to content", Enter moves focus into the page', async ({ page }) => {
    await signInAsAdmin(page)
    await page.goto('/AgroCloud/#/admin/system-settings')
    await expect(page.locator('h1').first()).toBeVisible()

    await page.keyboard.press('Tab')
    const skip = page.locator('.ds-skip-link')
    await expect(skip).toBeFocused()
    await expect(skip).toBeInViewport()

    await page.keyboard.press('Enter')
    await expect(page.locator('#main-content')).toBeFocused()
    await expect(page).toHaveURL(/#\/admin\/system-settings$/) // hash route unchanged
  })

  test('every Tab stop on key pages shows a visible focus indicator', async ({ page }) => {
    await signInAsAdmin(page)
    for (const path of ['/', '/admin/system-settings', '/account/profile']) {
      await page.goto(`/AgroCloud/#${path}`)
      await expect(page.locator('h1').first()).toBeVisible()
      const invisible: string[] = []
      for (let i = 0; i < 25; i++) {
        await page.keyboard.press('Tab')
        const miss = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null
          if (!el || el === document.body) return null
          const style = getComputedStyle(el)
          const hasOutline = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0
          const hasRing = style.boxShadow !== 'none'
          // Text fields signal focus on their wrapper (MUI or :focus-within rings).
          let wrapper: HTMLElement | null = el.parentElement
          let wrapperRing = false
          for (let depth = 0; wrapper && depth < 3; depth++, wrapper = wrapper.parentElement) {
            const ws = getComputedStyle(wrapper)
            if (ws.boxShadow !== 'none' || (ws.outlineStyle !== 'none' && parseFloat(ws.outlineWidth) > 0)) wrapperRing = true
          }
          const isTextField = el.matches('input:not([type=checkbox]):not([type=radio]), textarea, select')
          return hasOutline || hasRing || (isTextField && wrapperRing) ? null : el.outerHTML.slice(0, 120)
        })
        if (miss) invisible.push(`${path}: ${miss}`)
      }
      expect(invisible, 'focused elements without a visible indicator').toEqual([])
    }
  })

  test('Escape closes the fertigation report modal', async ({ page }) => {
    await signInAsAdmin(page)
    await page.goto('/AgroCloud/#/data/fertigation-records')
    const open = page.getByRole('button', { name: /report/i }).first()
    test.skip((await open.count()) === 0, 'report entry point not present in this configuration')
    await open.click()
    const overlay = page.locator('.report-modal-overlay')
    await expect(overlay).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(overlay).toHaveCount(0)
  })
})
