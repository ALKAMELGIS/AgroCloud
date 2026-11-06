import type { DevelopEliteGridLayoutItem } from './developEliteGridLayout'
import { clampGridItem } from './developEliteGridEngine'

export type GridResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

export const GRID_RESIZE_EDGES: GridResizeEdge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']

/** Map pointer delta → grid steps (more responsive than Math.round on small drags). */
export function pixelDeltaToGridSteps(deltaPx: number, unitPx: number): number {
  if (!Number.isFinite(deltaPx) || deltaPx === 0) return 0
  const unit = Math.max(1, unitPx)
  const bias = unit * 0.12
  if (deltaPx > 0) return Math.floor((deltaPx + bias) / unit)
  return -Math.floor((-deltaPx + bias) / unit)
}

export function resizeGridItemFromDelta(
  start: DevelopEliteGridLayoutItem,
  edge: GridResizeEdge,
  totalDeltaX: number,
  totalDeltaY: number,
  cols: number,
  colUnitPx: number,
  rowUnitPx: number,
): DevelopEliteGridLayoutItem {
  /** Layout edit: allow shrinking to a single grid cell (free resize). */
  const minW = 1
  const minH = 1
  const dCol = pixelDeltaToGridSteps(totalDeltaX, colUnitPx)
  const dRow = pixelDeltaToGridSteps(totalDeltaY, rowUnitPx)

  let x = start.x
  let y = start.y
  let w = start.w
  let h = start.h

  if (edge.includes('e')) {
    w = Math.max(minW, Math.min(cols - x, start.w + dCol))
  }
  if (edge.includes('w')) {
    const nextW = Math.max(minW, start.w - dCol)
    const shift = start.w - nextW
    x = Math.max(0, start.x + shift)
    w = Math.min(nextW, cols - x)
  }
  if (edge.includes('s')) {
    h = Math.max(minH, start.h + dRow)
  }
  if (edge.includes('n')) {
    const nextH = Math.max(minH, start.h - dRow)
    const grow = nextH - start.h
    y = Math.max(0, start.y - grow)
    h = start.y + start.h - y
  }

  return clampGridItem({ ...start, x, y, w, h }, cols, true)
}
