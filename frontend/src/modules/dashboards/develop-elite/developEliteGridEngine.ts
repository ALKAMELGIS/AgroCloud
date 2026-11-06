/**
 * Develop Elite grid layout engine (CSS Grid cells, not absolute drag).
 * Supports: drag/drop snap, resize, collision push, vertical compaction, Shift+stack split.
 */
import type { DevelopEliteGridLayoutItem } from './developEliteGridLayout'
import {
  findGridDropTarget,
  metricsFromPointer,
  resolveMovedFirst,
  resolveSplitAxis,
  splitWidgetSpace,
  type SplitAxis,
} from './developEliteGridDrop'

export function gridItemsCollide(a: DevelopEliteGridLayoutItem, b: DevelopEliteGridLayoutItem): boolean {
  if (a.i === b.i) return false
  if (a.x + a.w <= b.x) return false
  if (a.x >= b.x + b.w) return false
  if (a.y + a.h <= b.y) return false
  if (a.y >= b.y + b.h) return false
  return true
}

export function clampGridItem(
  item: DevelopEliteGridLayoutItem,
  cols: number,
  free = false,
): DevelopEliteGridLayoutItem {
  const minW = free ? 1 : (item.minW ?? 1)
  const minH = free ? 1 : (item.minH ?? 1)
  const w = Math.max(minW, Math.min(item.w, cols))
  const x = clamp(item.x, 0, Math.max(0, cols - w))
  const h = Math.max(minH, item.h)
  const y = Math.max(0, item.y)
  return { ...item, x, y, w, h }
}

/** Snap pointer position to grid cell (top-left of item). */
export function pointerToGridCell(
  pointerClientX: number,
  pointerClientY: number,
  containerRect: DOMRect,
  scrollTop: number,
  cols: number,
  rowHeight: number,
  marginX: number,
  marginY: number,
  itemW: number,
  itemH: number,
): { x: number; y: number } {
  const metrics = metricsFromPointer(
    pointerClientX,
    pointerClientY,
    containerRect,
    scrollTop,
    cols,
    rowHeight,
    marginX,
    marginY,
  )
  const x = clamp(metrics.cellX, 0, Math.max(0, cols - itemW))
  const y = clamp(metrics.cellY, 0, 500)
  return { x, y }
}

export type GridDropContext = {
  shiftKey: boolean
  pointerClientX: number
  pointerClientY: number
  containerRect: DOMRect
  scrollTop: number
  rowHeight: number
  marginX: number
  marginY: number
}

function sortByReadingOrder(layout: DevelopEliteGridLayoutItem[]): DevelopEliteGridLayoutItem[] {
  return [...layout].sort((a, b) => a.y - b.y || a.x - b.x)
}

/** Close vertical gaps between rows (ArcGIS-style pack upward). */
export function tightenGridRowGaps(
  layout: DevelopEliteGridLayoutItem[],
  cols: number,
  pinnedIds: Set<string> = new Set(),
): DevelopEliteGridLayoutItem[] {
  const sorted = sortByReadingOrder(layout)
  const out: DevelopEliteGridLayoutItem[] = []

  for (const item of sorted) {
    let next = clampGridItem(item, cols)
    if (!pinnedIds.has(next.i)) {
      while (next.y > 0) {
        const candidate = { ...next, y: next.y - 1 }
        if (out.some(other => gridItemsCollide(candidate, other))) break
        next = candidate
      }
    }
    out.push(next)
  }
  return out
}

function applyShiftStackDrop(
  layout: DevelopEliteGridLayoutItem[],
  moved: DevelopEliteGridLayoutItem,
  target: DevelopEliteGridLayoutItem,
  ctx: GridDropContext,
  cols: number,
): DevelopEliteGridLayoutItem[] | null {
  const metrics = metricsFromPointer(
    ctx.pointerClientX,
    ctx.pointerClientY,
    ctx.containerRect,
    ctx.scrollTop,
    cols,
    ctx.rowHeight,
    ctx.marginX,
    ctx.marginY,
  )
  let axis: SplitAxis = resolveSplitAxis(target, metrics)
  const movedFirst = resolveMovedFirst(target, axis, metrics)
  let split = splitWidgetSpace(target, moved, axis, movedFirst, cols)
  if (!split) {
    axis = axis === 'column' ? 'row' : 'column'
    split = splitWidgetSpace(target, moved, axis, movedFirst, cols)
  }
  if (!split) return null

  const rest = layout.filter(item => item.i !== moved.i && item.i !== target.i)
  return [...rest, ...split]
}

function layoutOverlaps(layout: DevelopEliteGridLayoutItem[]): boolean {
  for (let i = 0; i < layout.length; i += 1) {
    for (let j = i + 1; j < layout.length; j += 1) {
      if (gridItemsCollide(layout[i]!, layout[j]!)) return true
    }
  }
  return false
}

/**
 * Move one card. Empty space keeps every other card still.
 * A drop on another card swaps those two only.
 */
export function applyGridCardDrop(
  layout: DevelopEliteGridLayoutItem[],
  moved: DevelopEliteGridLayoutItem,
  cols: number,
  ctx?: GridDropContext,
): DevelopEliteGridLayoutItem[] {
  if (ctx?.shiftKey) {
    const metrics = metricsFromPointer(
      ctx.pointerClientX,
      ctx.pointerClientY,
      ctx.containerRect,
      ctx.scrollTop,
      cols,
      ctx.rowHeight,
      ctx.marginX,
      ctx.marginY,
    )
    const target = findGridDropTarget(layout, metrics.cellX, metrics.cellY, moved.i)
    if (target) {
      const stacked = applyShiftStackDrop(layout, moved, target, ctx, cols)
      if (stacked) return stacked
    }
  }

  const previous = layout.find(item => item.i === moved.i)
  const placed = clampGridItem(moved, cols, true)
  const rest = layout.filter(item => item.i !== placed.i).map(item => ({ ...item }))
  const overlaps = rest.filter(item => gridItemsCollide(placed, item))
  if (overlaps.length === 0) return [...rest, placed]

  let hit = overlaps[0]!
  if (ctx) {
    const metrics = metricsFromPointer(
      ctx.pointerClientX,
      ctx.pointerClientY,
      ctx.containerRect,
      ctx.scrollTop,
      cols,
      ctx.rowHeight,
      ctx.marginX,
      ctx.marginY,
    )
    const underPointer = findGridDropTarget(layout, metrics.cellX, metrics.cellY, moved.i)
    if (underPointer && overlaps.some(item => item.i === underPointer.i)) hit = underPointer
  }

  const origin = previous ?? placed
  const swappedMoved = clampGridItem({ ...placed, x: hit.x, y: hit.y }, cols, true)
  const swappedHit = clampGridItem({ ...hit, x: origin.x, y: origin.y }, cols, true)
  const swapped = rest.map(item => (item.i === hit.i ? swappedHit : item))
  swapped.push(swappedMoved)
  if (!layoutOverlaps(swapped)) return swapped

  const tradedMoved = clampGridItem(
    { ...placed, x: hit.x, y: hit.y, w: hit.w, h: hit.h },
    cols,
    true,
  )
  const tradedHit = clampGridItem(
    { ...hit, x: origin.x, y: origin.y, w: origin.w, h: origin.h },
    cols,
    true,
  )
  return [...rest.filter(item => item.i !== hit.i), tradedHit, tradedMoved]
}

export function previewGridWhileDragging(
  layout: DevelopEliteGridLayoutItem[],
  moved: DevelopEliteGridLayoutItem,
  cols: number,
  ctx?: GridDropContext,
): DevelopEliteGridLayoutItem[] {
  return applyGridCardDrop(layout, moved, cols, ctx)
}

function rememberUserSize(item: DevelopEliteGridLayoutItem): DevelopEliteGridLayoutItem {
  return {
    ...item,
    minW: Math.min(item.minW ?? item.w, item.w),
    minH: Math.min(item.minH ?? item.h, item.h),
  }
}

function sameRect(a: DevelopEliteGridLayoutItem, b: DevelopEliteGridLayoutItem): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h
}

function stepToward(
  card: DevelopEliteGridLayoutItem,
  origin: DevelopEliteGridLayoutItem,
): DevelopEliteGridLayoutItem {
  if (card.w > origin.w) return { ...card, w: card.w - 1 }
  if (card.h > origin.h) return { ...card, h: card.h - 1 }
  if (card.x < origin.x) return { ...card, x: card.x + 1 }
  if (card.y < origin.y) return { ...card, y: card.y + 1 }
  if (card.w < origin.w) return { ...card, w: card.w + 1 }
  if (card.h < origin.h) return { ...card, h: card.h + 1 }
  if (card.x > origin.x) return { ...card, x: card.x - 1 }
  if (card.y > origin.y) return { ...card, y: card.y - 1 }
  return card
}

function hitsThird(
  candidate: DevelopEliteGridLayoutItem,
  selfId: string,
  anchorId: string,
  items: DevelopEliteGridLayoutItem[],
): boolean {
  return items.some(item => item.i !== selfId && item.i !== anchorId && gridItemsCollide(candidate, item))
}

/** Shift a touching card into free space, or give it one less overlapping cell. Never touches anyone else. */
function relieveDirectOverlap(
  anchor: DevelopEliteGridLayoutItem,
  hit: DevelopEliteGridLayoutItem,
  items: DevelopEliteGridLayoutItem[],
  cols: number,
): DevelopEliteGridLayoutItem | null {
  const overlapW = Math.min(anchor.x + anchor.w, hit.x + hit.w) - Math.max(anchor.x, hit.x)
  const overlapH = Math.min(anchor.y + anchor.h, hit.y + hit.h) - Math.max(anchor.y, hit.y)
  if (overlapW <= 0 || overlapH <= 0) return hit

  const shifts: DevelopEliteGridLayoutItem[] = []
  const pushRight = anchor.x + anchor.w
  const pushLeft = anchor.x - hit.w
  const pushDown = anchor.y + anchor.h
  const pushUp = anchor.y - hit.h
  if (pushRight + hit.w <= cols) shifts.push({ ...hit, x: pushRight })
  if (pushLeft >= 0) shifts.push({ ...hit, x: pushLeft })
  shifts.push({ ...hit, y: pushDown })
  if (pushUp >= 0) shifts.push({ ...hit, y: pushUp })

  const steals: DevelopEliteGridLayoutItem[] = []
  if (hit.x >= anchor.x && hit.w - overlapW >= 1) {
    steals.push({ ...hit, x: anchor.x + anchor.w, w: hit.w - overlapW })
  }
  if (hit.x < anchor.x && hit.w - overlapW >= 1) {
    steals.push({ ...hit, w: hit.w - overlapW })
  }
  if (hit.y >= anchor.y && hit.h - overlapH >= 1) {
    steals.push({ ...hit, y: anchor.y + anchor.h, h: hit.h - overlapH })
  }
  if (hit.y < anchor.y && hit.h - overlapH >= 1) {
    steals.push({ ...hit, h: hit.h - overlapH })
  }

  for (const candidate of [...shifts, ...steals]) {
    const clamped = clampGridItem(candidate, cols, true)
    if (!gridItemsCollide(clamped, anchor) && !hitsThird(clamped, hit.i, anchor.i, items)) return clamped
  }
  return null
}

/** Resize one card. Shrink stays. Growth stops at the next card instead of shoving the whole board. */
export function applyGridCardResize(
  layout: DevelopEliteGridLayoutItem[],
  resized: DevelopEliteGridLayoutItem,
  cols: number,
): DevelopEliteGridLayoutItem[] {
  const original = layout.find(item => item.i === resized.i)
  const placed = clampGridItem(resized, cols, true)
  if (!original) return layout.map(item => (item.i === placed.i ? rememberUserSize(placed) : item))

  const others = layout.filter(item => item.i !== placed.i).map(item => ({ ...item }))
  if (!others.some(item => gridItemsCollide(placed, item))) {
    return [...others, rememberUserSize(placed)]
  }

  let card = { ...placed }
  for (let guard = 0; guard < 64; guard += 1) {
    const hit = others.find(item => gridItemsCollide(card, item))
    if (!hit) break
    const relieved = relieveDirectOverlap(card, hit, others, cols)
    if (relieved) {
      const index = others.findIndex(item => item.i === hit.i)
      others[index] = relieved
      continue
    }
    const next = stepToward(card, original)
    if (sameRect(next, card)) break
    card = next
  }

  if (others.some(item => gridItemsCollide(card, item))) {
    return layout.map(item => ({ ...item }))
  }
  return [...others, rememberUserSize(card)]
}

/** After a widget is removed/hidden, pack remaining cards. */
export function reflowAfterWidgetRemoval(
  layout: DevelopEliteGridLayoutItem[],
  cols: number,
): DevelopEliteGridLayoutItem[] {
  return tightenGridRowGaps(layout.map(item => clampGridItem(item, cols)), cols)
}

export function gridLayoutMaxRow(layout: DevelopEliteGridLayoutItem[]): number {
  let max = 0
  for (const item of layout) max = Math.max(max, item.y + item.h)
  return max
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}
