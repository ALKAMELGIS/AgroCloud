import type { CropAlertFieldResult } from './siCropAlertEngine'
import {
  expandLngLatBBox,
  geometryIntersectsLngLatBBox,
  pointInLngLatBBox,
  type LngLatBBox,
} from './siMapViewport'

const MARKER_VIEWPORT_EXPAND = 0.18
const LOW_ZOOM_MARKER_CAP = 96
const LOW_ZOOM_THRESHOLD = 6

function markerDisplayPriority(result: CropAlertFieldResult): number {
  switch (result.severity) {
    case 'critical':
      return 4
    case 'high':
      return 3
    case 'warning':
      return 2
    default:
      return 1
  }
}

function resultIntersectsBBox(result: CropAlertFieldResult, bbox: LngLatBBox): boolean {
  const [lng, lat] = result.centroid
  return (
    (result.geometry && geometryIntersectsLngLatBBox(result.geometry, bbox)) ||
    pointInLngLatBBox(lng, lat, bbox)
  )
}

/** Viewport-scoped marker list — caps density at low zoom while keeping critical alerts visible. */
export function filterCropAlertMarkersForViewport(
  results: CropAlertFieldResult[],
  viewportBbox: LngLatBBox | null,
  mapZoom: number | null,
  alwaysVisibleKeys: ReadonlySet<string>,
): CropAlertFieldResult[] {
  if (!results.length) return results
  if (!viewportBbox) return results

  const bbox = expandLngLatBBox(viewportBbox, MARKER_VIEWPORT_EXPAND)
  const pinned = new Set(alwaysVisibleKeys)
  const visible: CropAlertFieldResult[] = []

  for (const result of results) {
    if (pinned.has(result.fieldKey) || resultIntersectsBBox(result, bbox)) {
      visible.push(result)
    }
  }

  if (mapZoom == null || mapZoom >= LOW_ZOOM_THRESHOLD || visible.length <= LOW_ZOOM_MARKER_CAP) {
    return visible
  }

  const pinnedResults = visible.filter(r => pinned.has(r.fieldKey))
  const rest = visible
    .filter(r => !pinned.has(r.fieldKey))
    .sort((a, b) => markerDisplayPriority(b) - markerDisplayPriority(a))
  const cap = Math.max(LOW_ZOOM_MARKER_CAP - pinnedResults.length, 0)
  return [...pinnedResults, ...rest.slice(0, cap)]
}
