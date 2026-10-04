import { quantizeLngLatBBox } from '@/modules/gis/map/siMapViewport'
import type { DevelopEliteMapView } from './developEliteKpiEngine'

/** Coarse grid — fewer dashboard re-renders while panning the map. */
export const DEVELOP_ELITE_MAP_VIEW_BBOX_TILE_DEG = 0.28
const ZOOM_QUANTUM = 0.5

export function quantizeDevelopEliteMapView(view: DevelopEliteMapView): DevelopEliteMapView {
  const [west, south, east, north] = quantizeLngLatBBox(
    [view.west, view.south, view.east, view.north],
    DEVELOP_ELITE_MAP_VIEW_BBOX_TILE_DEG,
  )
  const zoom = Math.round(view.zoom / ZOOM_QUANTUM) * ZOOM_QUANTUM
  return { west, south, east, north, zoom }
}

export function developEliteMapViewSignature(view: DevelopEliteMapView): string {
  const q = quantizeDevelopEliteMapView(view)
  return `${q.west.toFixed(3)}|${q.south.toFixed(3)}|${q.east.toFixed(3)}|${q.north.toFixed(3)}|${q.zoom.toFixed(2)}`
}

export function shouldPublishDevelopEliteMapView(
  prev: DevelopEliteMapView | null,
  next: DevelopEliteMapView,
): boolean {
  if (!prev) return true
  return developEliteMapViewSignature(prev) !== developEliteMapViewSignature(next)
}
