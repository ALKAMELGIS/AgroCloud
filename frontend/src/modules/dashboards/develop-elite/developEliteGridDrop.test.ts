import { describe, expect, it } from 'vitest'
import { layoutWithoutOverlap, splitWidgetSpace } from './developEliteGridDrop'
import { applyGridCardDrop } from './developEliteGridEngine'
import type { GridDropContext } from './developEliteGridEngine'

describe('developEliteGridDrop', () => {
  it('splits host space into two non-overlapping tiles', () => {
    const host = { i: 'map', x: 4, y: 2, w: 8, h: 6, minW: 2, minH: 2 }
    const moved = { i: 'chart-pie', x: 0, y: 0, w: 4, h: 3, minW: 2, minH: 2 }
    const split = splitWidgetSpace(host, moved, 'column', true, 24)
    expect(split).toBeTruthy()
    if (!split) return
    expect(split[0].i).toBe('chart-pie')
    expect(split[1].i).toBe('map')
    expect(split[0].w + split[1].w).toBe(host.w)
    expect(layoutWithoutOverlap(split)).toBe(true)
  })

  it('shift-drops on target and reflows without unintended overlap', () => {
    const layout = [
      { i: 'map', x: 0, y: 0, w: 12, h: 6, minW: 2, minH: 2 },
      { i: 'chart-pie', x: 0, y: 6, w: 6, h: 4, minW: 2, minH: 2 },
    ]
    const ctx: GridDropContext = {
      shiftKey: true,
      pointerClientX: 600,
      pointerClientY: 90,
      containerRect: {
        left: 0,
        top: 0,
        width: 1200,
        height: 800,
        right: 1200,
        bottom: 800,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      },
      scrollTop: 0,
      rowHeight: 28,
      marginX: 3,
      marginY: 3,
    }
    const moved = { i: 'chart-pie', x: 0, y: 6, w: 6, h: 4, minW: 2, minH: 2 }
    const next = applyGridCardDrop(layout, moved, 12, ctx)
    expect(layoutWithoutOverlap(next)).toBe(true)
    expect(next.some(i => i.i === 'map')).toBe(true)
    expect(next.some(i => i.i === 'chart-pie')).toBe(true)
  })
})
