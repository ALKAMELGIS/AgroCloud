import { describe, expect, it } from 'vitest'
import { applyGridCardDrop } from './developEliteGridEngine'
import {
  cellChanged,
  commitDragAtPlaceholder,
  layoutHasCollision,
  previewSiblingsWhileDragging,
} from './developEliteGridDragPreview'

describe('developEliteGridDragPreview', () => {
  it('detects grid cell changes', () => {
    expect(cellChanged(null, { x: 1, y: 2, w: 4, h: 3 })).toBe(true)
    expect(cellChanged({ x: 1, y: 2, w: 4, h: 3 }, { x: 1, y: 2, w: 4, h: 3 })).toBe(false)
    expect(cellChanged({ x: 1, y: 2, w: 4, h: 3 }, { x: 2, y: 2, w: 4, h: 3 })).toBe(true)
  })

  it('leaves siblings in place while one card is dragged', () => {
    const layout = [
      { i: 'map', x: 0, y: 0, w: 12, h: 4 },
      { i: 'chart-pie', x: 0, y: 4, w: 4, h: 3 },
      { i: 'zones', x: 12, y: 4, w: 4, h: 3 },
    ]
    const pie = layout.find(i => i.i === 'chart-pie')!
    const siblings = previewSiblingsWhileDragging(
      layout,
      'chart-pie',
      pie,
      { x: 8, y: 4, w: 4, h: 3 },
      12,
    )
    expect(siblings.some(i => i.i === 'chart-pie')).toBe(false)
    expect(siblings.find(i => i.i === 'map')).toMatchObject({ x: 0, y: 0, w: 12, h: 4 })
    expect(siblings.find(i => i.i === 'zones')).toMatchObject({ x: 12, y: 4, w: 4, h: 3 })
    expect(layoutHasCollision(siblings)).toBe(false)
  })

  it('commit matches direct applyGridCardDrop', () => {
    const layout = [
      { i: 'a', x: 0, y: 0, w: 6, h: 2 },
      { i: 'b', x: 6, y: 0, w: 6, h: 2 },
    ]
    const b = layout.find(i => i.i === 'b')!
    const placeholder = { x: 0, y: 2, w: 6, h: 2 }
    const viaCommit = commitDragAtPlaceholder(layout, b, placeholder, 12)
    const moved = { ...b, x: placeholder.x, y: placeholder.y }
    const direct = applyGridCardDrop(layout, moved, 12)
    expect(viaCommit).toEqual(direct)
  })
})
