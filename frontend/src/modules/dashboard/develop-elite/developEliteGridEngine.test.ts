import { describe, expect, it } from 'vitest'
import {
  applyGridCardDrop,
  applyGridCardResize,
  gridItemsCollide,
  tightenGridRowGaps,
} from './developEliteGridEngine'

describe('developEliteGridEngine', () => {
  it('detects collision between grid items', () => {
    const a = { i: 'a', x: 0, y: 0, w: 4, h: 2 }
    const b = { i: 'b', x: 2, y: 1, w: 4, h: 2 }
    expect(gridItemsCollide(a, b)).toBe(true)
    expect(gridItemsCollide(a, { ...b, x: 5 })).toBe(false)
  })

  it('keeps dropped row when moving down in 2D', () => {
    const layout = [
      { i: 'map', x: 0, y: 0, w: 12, h: 4 },
      { i: 'chart-pie', x: 0, y: 4, w: 4, h: 3 },
    ]
    const dropped = applyGridCardDrop(layout, { i: 'chart-pie', x: 8, y: 6, w: 4, h: 3 }, 12)
    const pie = dropped.find(item => item.i === 'chart-pie')
    expect(pie?.y).toBeGreaterThanOrEqual(4)
    expect(pie?.x).toBe(8)
  })

  it('tightens only empty rows without collapsing x', () => {
    const layout = [
      { i: 'a', x: 0, y: 3, w: 4, h: 2 },
      { i: 'b', x: 4, y: 3, w: 4, h: 2 },
    ]
    const tight = tightenGridRowGaps(layout, 12)
    expect(tight.find(i => i.i === 'a')?.y).toBe(0)
    expect(tight.find(i => i.i === 'b')?.x).toBe(4)
  })

  it('swaps only the overlapped card and leaves the rest of the board', () => {
    const layout = [
      { i: 'a', x: 0, y: 0, w: 6, h: 2 },
      { i: 'b', x: 6, y: 0, w: 6, h: 2 },
      { i: 'c', x: 0, y: 4, w: 4, h: 3 },
    ]
    const out = applyGridCardDrop(layout, { i: 'a', x: 4, y: 0, w: 6, h: 2 }, 12)
    const a = out.find(i => i.i === 'a')!
    const b = out.find(i => i.i === 'b')!
    const c = out.find(i => i.i === 'c')!
    expect(gridItemsCollide(a, b)).toBe(false)
    expect(c).toMatchObject({ x: 0, y: 4, w: 4, h: 3 })
  })

  it('gives a grown card the overlapping cells and leaves distant cards', () => {
    const layout = [
      { i: 'a', x: 0, y: 0, w: 4, h: 2 },
      { i: 'b', x: 4, y: 0, w: 4, h: 2 },
      { i: 'c', x: 0, y: 6, w: 4, h: 2 },
    ]
    const out = applyGridCardResize(layout, { i: 'a', x: 0, y: 0, w: 6, h: 2 }, 12)
    expect(out.find(i => i.i === 'a')?.w).toBe(6)
    expect(gridItemsCollide(out.find(i => i.i === 'a')!, out.find(i => i.i === 'b')!)).toBe(false)
    expect(out.find(i => i.i === 'c')).toMatchObject({ x: 0, y: 6, w: 4, h: 2 })
  })

  it('keeps a shrink instead of restoring the previous size', () => {
    const layout = [
      { i: 'a', x: 0, y: 0, w: 6, h: 4, minW: 4, minH: 4 },
      { i: 'b', x: 6, y: 0, w: 4, h: 4 },
    ]
    const out = applyGridCardResize(layout, { i: 'a', x: 0, y: 0, w: 2, h: 1, minW: 4, minH: 4 }, 12)
    expect(out.find(i => i.i === 'a')).toMatchObject({ w: 2, h: 1 })
    expect(out.find(i => i.i === 'b')).toMatchObject({ x: 6, y: 0, w: 4, h: 4 })
  })
})
