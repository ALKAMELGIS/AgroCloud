import type { DevelopEliteGridLayoutItem } from './developEliteGridLayout'
import { clampGridItem, gridItemsCollide } from './developEliteGridEngine'

export type GridPointerMetrics = {
  cellX: number
  cellY: number
  colWidth: number
  rowStride: number
}

export function metricsFromPointer(
  pointerClientX: number,
  pointerClientY: number,
  containerRect: DOMRect,
  scrollTop: number,
  cols: number,
  rowHeight: number,
  marginX: number,
  marginY: number,
): GridPointerMetrics {
  const colWidth = (containerRect.width - marginX * (cols + 1)) / cols
  const rowStride = rowHeight + marginY
  const relX = pointerClientX - containerRect.left - marginX
  const relY = pointerClientY - containerRect.top - marginY + scrollTop
  const cellX = Math.max(0, Math.floor(relX / (colWidth + marginX)))
  const cellY = Math.max(0, Math.floor(relY / rowStride))
  return { cellX, cellY, colWidth, rowStride }
}

export function findGridDropTarget(
  layout: DevelopEliteGridLayoutItem[],
  cellX: number,
  cellY: number,
  excludeId: string,
): DevelopEliteGridLayoutItem | null {
  const hit = layout.find(
    item =>
      item.i !== excludeId &&
      cellX >= item.x &&
      cellX < item.x + item.w &&
      cellY >= item.y &&
      cellY < item.y + item.h,
  )
  return hit ?? null
}

export type SplitAxis = 'column' | 'row'

export function resolveSplitAxis(target: DevelopEliteGridLayoutItem, metrics: GridPointerMetrics): SplitAxis {
  const dx = Math.abs(metrics.cellX - (target.x + target.w / 2))
  const dy = Math.abs(metrics.cellY - (target.y + target.h / 2))
  if (dx >= dy) return 'column'
  return 'row'
}

export function resolveMovedFirst(
  target: DevelopEliteGridLayoutItem,
  axis: SplitAxis,
  metrics: GridPointerMetrics,
): boolean {
  if (axis === 'column') {
    return metrics.cellX < target.x + target.w / 2
  }
  return metrics.cellY < target.y + target.h / 2
}

export function splitWidgetSpace(
  host: DevelopEliteGridLayoutItem,
  moved: DevelopEliteGridLayoutItem,
  axis: SplitAxis,
  movedFirst: boolean,
  cols: number,
): DevelopEliteGridLayoutItem[] | null {
  const hostMinW = host.minW ?? 1
  const hostMinH = host.minH ?? 1
  const movedMinW = moved.minW ?? 1
  const movedMinH = moved.minH ?? 1

  if (axis === 'column') {
    if (host.w < 2) return null
    const wA = Math.max(hostMinW, movedMinW, Math.floor(host.w / 2))
    const wB = host.w - wA
    if (wB < hostMinW) return null
    const left = { ...host, x: host.x, y: host.y, w: wA, h: host.h }
    const right = { ...host, x: host.x + wA, y: host.y, w: wB, h: host.h }
    if (movedFirst) {
      return [
        clampGridItem({ ...moved, x: left.x, y: left.y, w: left.w, h: left.h }, cols),
        clampGridItem({ ...host, x: right.x, y: right.y, w: right.w, h: right.h }, cols),
      ]
    }
    return [
      clampGridItem(left, cols),
      clampGridItem({ ...moved, x: right.x, y: right.y, w: right.w, h: right.h }, cols),
    ]
  }

  if (host.h < 2) return null
  const hA = Math.max(hostMinH, movedMinH, Math.floor(host.h / 2))
  const hB = host.h - hA
  if (hB < hostMinH) return null
  const top = { ...host, x: host.x, y: host.y, w: host.w, h: hA }
  const bottom = { ...host, x: host.x, y: host.y + hA, w: host.w, h: hB }
  if (movedFirst) {
    return [
      clampGridItem({ ...moved, x: top.x, y: top.y, w: top.w, h: top.h }, cols),
      clampGridItem({ ...host, x: bottom.x, y: bottom.y, w: bottom.w, h: bottom.h }, cols),
    ]
  }
  return [
    clampGridItem(top, cols),
    clampGridItem({ ...moved, x: bottom.x, y: bottom.y, w: bottom.w, h: bottom.h }, cols),
  ]
}

export function itemContainsCell(item: DevelopEliteGridLayoutItem, cellX: number, cellY: number): boolean {
  return cellX >= item.x && cellX < item.x + item.w && cellY >= item.y && cellY < item.y + item.h
}

export function layoutWithoutOverlap(layout: DevelopEliteGridLayoutItem[]): boolean {
  for (let i = 0; i < layout.length; i++) {
    for (let j = i + 1; j < layout.length; j++) {
      if (gridItemsCollide(layout[i], layout[j])) return false
    }
  }
  return true
}
