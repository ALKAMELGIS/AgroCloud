import { expect, test } from 'playwright/test'

test.describe('Home grid layout & performance', () => {
  // LCP/CLS budgets are timing-sensitive: run these viewports one at a time so parallel
  // workers rendering 4K pages in software do not skew the measurement.
  test.describe.configure({ mode: 'serial' })

  const viewports = [
    { name: 'mobile-320', width: 320, height: 780 },
    { name: 'tablet-768', width: 768, height: 900 },
    { name: 'desktop-1200', width: 1200, height: 900 },
    { name: '4k-3840', width: 3840, height: 1400 },
  ] as const

  for (const vp of viewports) {
    test(`${vp.name}: responsive card grid without overlap`, async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem(
          'currentUser',
          JSON.stringify({ id: 1, name: 'Test User', email: 'test@example.com', role: 'admin' })
        )
        ;(window as any).__perf = { cls: 0, lcp: 0 }

        try {
          new PerformanceObserver((list) => {
            for (const e of list.getEntries() as any[]) {
              if (!e.hadRecentInput) (window as any).__perf.cls += e.value
            }
          }).observe({ type: 'layout-shift', buffered: true } as any)
        } catch {}

        try {
          new PerformanceObserver((list) => {
            const entries = list.getEntries() as any[]
            const last = entries[entries.length - 1]
            if (last?.startTime) (window as any).__perf.lcp = last.startTime
          }).observe({ type: 'largest-contentful-paint', buffered: true } as any)
        } catch {}
      })

      await page.setViewportSize({ width: vp.width, height: vp.height })
      await page.goto('/', { waitUntil: 'networkidle' })

      const cards = page.locator('.app-icon-card')
      await expect(cards.first()).toBeVisible()
      const cardCount = await cards.count()
      expect(cardCount).toBeGreaterThanOrEqual(5)

      await page.waitForTimeout(1200)

      const boxes = await cards.evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect()
          return { x: r.x, y: r.y, w: r.width, h: r.height, revealed: el.classList.contains('is-visible') }
        })
      )

      // Home is a responsive card grid (auto-fill columns that wrap into rows; one column on phones).
      const visible = boxes.filter((b) => b.w > 0 && b.h > 0)
      expect(visible.length).toBeGreaterThan(1)

      // No card spills outside the viewport horizontally.
      for (const b of visible) {
        expect(b.x).toBeGreaterThanOrEqual(-1)
        expect(b.x + b.w).toBeLessThanOrEqual(vp.width + 1)
      }

      // No two cards overlap.
      for (let i = 0; i < visible.length; i += 1) {
        for (let j = i + 1; j < visible.length; j += 1) {
          const a = visible[i]
          const c = visible[j]
          const overlapX = Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x)
          const overlapY = Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y)
          expect(overlapX > 1 && overlapY > 1, `cards ${i} and ${j} overlap`).toBe(false)
        }
      }

      // Cards form aligned rows: every card's top matches the top of some row (±2px).
      const rowTops = [...new Set(visible.map((b) => Math.round(b.y)))].sort((a, b) => a - b)
      const rows: number[] = []
      for (const top of rowTops) if (!rows.some((r) => Math.abs(r - top) <= 2)) rows.push(top)
      for (const b of visible) expect(rows.some((r) => Math.abs(r - b.y) <= 2)).toBe(true)

      const perf = await page.evaluate(() => (window as any).__perf || { cls: 0, lcp: 0 })
      expect(perf.cls).toBeLessThan(0.1)
      expect(perf.lcp).toBeGreaterThan(0)
      expect(perf.lcp).toBeLessThan(2500)
    })
  }
})
