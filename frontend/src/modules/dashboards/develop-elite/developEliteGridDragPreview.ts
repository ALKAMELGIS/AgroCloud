import type { DevelopEliteGridLayoutItem } from './developEliteGridLayout'
import {
  applyGridCardDrop,
  clampGridItem,
  gridItemsCollide,
  type GridDropContext,
} from './developEliteGridEngine'

export type GridDragPlaceholder = { x: number; y: number; w: number; h: number }

export type GridDragGhostRect = {
  left: number
  top: number
  width: number
  height: number
}

export function cellChanged(
  prev: GridDragPlaceholder | null,
  next: GridDragPlaceholder,
): boolean {
  if (!prev) return true
  return prev.x !== next.x || prev.y !== next.y
}

/** Keep every other card still while one card is dragged. */
export function previewSiblingsWhileDragging(
  layout: DevelopEliteGridLayoutItem[],
  draggedId: string,
  _draggedItem: DevelopEliteGridLayoutItem,
  _placeholder: GridDragPlaceholder,
  _cols: number,
  _ctx?: GridDropContext,
): DevelopEliteGridLayoutItem[] {
  return layout.filter(item => item.i !== draggedId).map(item => ({ ...item }))
}

export function commitDragAtPlaceholder(
  layout: DevelopEliteGridLayoutItem[],
  draggedItem: DevelopEliteGridLayoutItem,
  placeholder: GridDragPlaceholder,
  cols: number,
  ctx?: GridDropContext,
): DevelopEliteGridLayoutItem[] {
  const moved = clampGridItem(
    { ...draggedItem, x: placeholder.x, y: placeholder.y, w: placeholder.w, h: placeholder.h },
    cols,
  )
  return applyGridCardDrop(layout, moved, cols, ctx)
}

export function ghostRectFromPointer(
  clientX: number,
  clientY: number,
  rootRect: DOMRect,
  scrollTop: number,
  grabOffsetX: number,
  grabOffsetY: number,
  itemW: number,
  itemH: number,
  colUnitPx: number,
  rowStridePx: number,
  marginX: number,
  marginY: number,
): GridDragGhostRect {
  const width = Math.max(1, itemW * colUnitPx + Math.max(0, itemW - 1) * marginX)
  const height = Math.max(1, itemH * rowStridePx + Math.max(0, itemH - 1) * marginY)
  const left = clientX - rootRect.left - grabOffsetX
  const top = clientY - rootRect.top - grabOffsetY + scrollTop
  return { left, top, width, height }
}

export function layoutHasCollision(layout: DevelopEliteGridLayoutItem[]): boolean {
  for (let i = 0; i < layout.length; i++) {
    for (let j = i + 1; j < layout.length; j++) {
      if (gridItemsCollide(layout[i], layout[j])) return true
    }
  }
  return false
}
