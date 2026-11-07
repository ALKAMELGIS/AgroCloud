import { describe, expect, it } from 'vitest'
import { resizeGridItemFromDelta } from './developEliteGridResize'
import { applyGridCardResize } from './developEliteGridEngine'

describe('developEliteGridResize', () => {
  it('grows east edge in column units', () => {
    const start = { i: 'a', x: 2, y: 1, w: 4, h: 3, minW: 2, minH: 2 }
    const next = resizeGridItemFromDelta(start, 'e', 80, 0, 12, 40, 30)
    expect(next.w).toBeGreaterThan(start.w)
    expect(next.x).toBe(start.x)
  })

  it('grows the north edge when dragging up', () => {
    const start = { i: 'map', x: 0, y: 4, w: 8, h: 6, minW: 1, minH: 1 }
    const next = resizeGridItemFromDelta(start, 'n', 0, -30, 24, 50, 28)
    expect(next.h).toBe(start.h + 1)
    expect(next.y).toBe(start.y - 1)
  })

  it('shrinks below the stored minimum while dragging down', () => {
    const start = { i: 'zones', x: 0, y: 2, w: 2, h: 6, minW: 2, minH: 6 }
    const next = resizeGridItemFromDelta(start, 'n', 0, 200, 24, 40, 28)
    expect(next.h).toBe(1)
    expect(next.minH).toBe(6)
  })

  it('keeps a grown card without pushing the neighbor off the grid', () => {
    const layout = [
      { i: 'a', x: 0, y: 0, w: 6, h: 2 },
      { i: 'b', x: 6, y: 0, w: 6, h: 2 },
    ]
    const resized = { i: 'a', x: 0, y: 0, w: 8, h: 2 }
    const out = applyGridCardResize(layout, resized, 12)
    const a = out.find(item => item.i === 'a')
    const b = out.find(item => item.i === 'b')
    expect(a?.w).toBe(8)
    expect((b?.x ?? 0) + (b?.w ?? 0)).toBeLessThanOrEqual(12)
    expect((a?.x ?? 0) + (a?.w ?? 0) <= (b?.x ?? 0) || (b?.y ?? 0) >= (a?.h ?? 0)).toBe(true)
  })
})
