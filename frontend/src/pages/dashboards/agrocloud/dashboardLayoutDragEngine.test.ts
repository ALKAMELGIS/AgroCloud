import { describe, expect, it } from 'vitest'
import {
  DASHBOARD_LAYOUT_SOFT_GAP_PX,
  resolveDropTargetAtPointer,
  snapPointerToGrid,
} from './dashboardLayoutDragEngine'

describe('dashboardLayoutDragEngine', () => {
  it('snaps pointer to 8px grid', () => {
    expect(snapPointerToGrid(17, 25)).toEqual({ x: 16, y: 24 })
  })

  it('finds drop target under pointer in free mode', () => {
    const rect = { left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200 } as DOMRect
    const target = resolveDropTargetAtPointer(100, 30, false, 'a', [{ elementId: 'b', rect }])
    expect(target?.targetElementId).toBe('b')
    expect(target?.zone).toBe('top')
    expect(target?.precisionMode).toBe(false)
  })

  it('enables precision snap near widget with shift', () => {
    const rect = { left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200 } as DOMRect
    const target = resolveDropTargetAtPointer(210, 100, true, 'a', [{ elementId: 'b', rect }])
    expect(target?.snapped).toBe(true)
    expect(target?.softGapPx).toBe(DASHBOARD_LAYOUT_SOFT_GAP_PX)
    expect(target?.precisionMode).toBe(true)
  })
})
