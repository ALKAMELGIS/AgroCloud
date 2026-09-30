import type { DashboardLayoutDropIntent, DashboardLayoutDropZone } from './agroCloudDashboardBodyLayout'
import { hitTestLayoutDropZone, resolveLayoutDropIntent } from './agroCloudDashboardBodyLayout'

export const DASHBOARD_LAYOUT_SOFT_GAP_PX = 12
export const DASHBOARD_LAYOUT_SNAP_RADIUS_PX = 36
export const DASHBOARD_LAYOUT_GRID_PX = 8

export type LayoutElementHost = {
  elementId: string
  rect: DOMRect
}

export type LayoutDragDropTarget = {
  targetElementId: string
  zone: DashboardLayoutDropZone
  intent: DashboardLayoutDropIntent
  precisionMode: boolean
  softGapPx: number
  snapped: boolean
}

export type LayoutDragSession = {
  elementId: string
  pointerX: number
  pointerY: number
  originX: number
  originY: number
  precisionMode: boolean
}

function rectContains(rect: DOMRect, x: number, y: number, pad = 0): boolean {
  return x >= rect.left - pad && x <= rect.right + pad && y >= rect.top - pad && y <= rect.bottom + pad
}

function distanceToRect(rect: DOMRect, x: number, y: number): number {
  const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0
  const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0
  return Math.hypot(dx, dy)
}

export function snapPointerToGrid(x: number, y: number, grid = DASHBOARD_LAYOUT_GRID_PX): { x: number; y: number } {
  return {
    x: Math.round(x / grid) * grid,
    y: Math.round(y / grid) * grid,
  }
}

export function resolveDropTargetAtPointer(
  pointerX: number,
  pointerY: number,
  shiftKey: boolean,
  draggedElementId: string,
  hosts: LayoutElementHost[],
): LayoutDragDropTarget | null {
  const precisionMode = shiftKey
  let best: LayoutDragDropTarget | null = null
  let bestScore = Number.POSITIVE_INFINITY

  for (const host of hosts) {
    if (host.elementId === draggedElementId) continue

    const inside = rectContains(host.rect, pointerX, pointerY, precisionMode ? 4 : 8)
    const distance = distanceToRect(host.rect, pointerX, pointerY)
    const snapEligible = precisionMode && distance <= DASHBOARD_LAYOUT_SNAP_RADIUS_PX

    if (!inside && !snapEligible) continue

    const zone = hitTestLayoutDropZone(pointerX, pointerY, host.rect, { precision: precisionMode })
    const intent = resolveLayoutDropIntent(zone, shiftKey)
    const softGapPx = precisionMode && intent.type === 'dock' ? DASHBOARD_LAYOUT_SOFT_GAP_PX : 0

    // Prefer direct hover over snap; closer rects win.
    const score = (inside ? 0 : 1000) + distance
    if (score >= bestScore) continue

    bestScore = score
    best = {
      targetElementId: host.elementId,
      zone,
      intent,
      precisionMode,
      softGapPx,
      snapped: !inside && snapEligible,
    }
  }

  return best
}

export function layoutDragGhostLabel(elementLabel: string, precisionMode: boolean): string {
  return precisionMode ? `${elementLabel} · Precision` : elementLabel
}
