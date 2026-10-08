import type { Map as MaplibreMap } from 'maplibre-gl'
import {
  applyAgroCloudMapGoogleEarthMouseHandlers,
  applyAgroCloudMapPerformanceTuning,
  type AgroCloudMapboxMapScrollLike,
} from '@/modules/gis/map/agroCloudMapNavigation'

/** Faster wheel zoom than the shared AgroCloud default (1/280). */
export const DEVELOP_ELITE_MAPLIBRE_WHEEL_ZOOM_RATE = 1 / 115

/** Light tile work while panning/zooming the dashboard grid map. */
export const DEVELOP_ELITE_MAPLIBRE_PERFORMANCE_OPTIONS = {
  prefetchZoomDelta: 0,
  maxParallelImageRequests: 14,
  tileCacheMb: 72,
} as const

export type DevelopEliteMapLibrePerformanceOptions = typeof DEVELOP_ELITE_MAPLIBRE_PERFORMANCE_OPTIONS

function asNavMap(map: MaplibreMap): AgroCloudMapboxMapScrollLike {
  return map as unknown as AgroCloudMapboxMapScrollLike
}

/** Basemap + handler tuning for Develop Elite MapLibre (Portfolio tab). */
export function applyDevelopEliteMapLibrePerformanceTuning(map: MaplibreMap | null | undefined): void {
  if (!map) return
  const nav = asNavMap(map)
  applyAgroCloudMapPerformanceTuning(nav, { ...DEVELOP_ELITE_MAPLIBRE_PERFORMANCE_OPTIONS })
  applyAgroCloudMapGoogleEarthMouseHandlers(nav)
  try {
    nav.scrollZoom?.enable?.()
    nav.scrollZoom?.setWheelZoomRate?.(DEVELOP_ELITE_MAPLIBRE_WHEEL_ZOOM_RATE)
    nav.doubleClickZoom?.enable?.()
    nav.touchZoomRotate?.enable?.()
    nav.boxZoom?.enable?.()
    nav.setRenderWorldCopies?.(false)
    ;(nav as { touchPitch?: { enable?: () => void } }).touchPitch?.enable?.()
    ;(nav as { dragPan?: { enable?: () => void } }).dragPan?.enable?.()
  } catch {
    /* ignore */
  }
}
