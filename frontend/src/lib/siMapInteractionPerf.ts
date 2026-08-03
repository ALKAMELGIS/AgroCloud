import type { LngLatBBox } from './siMapViewport'

/** Debounce committing map zoom/lat to React (WMS zoom gate only — not full viewState). */
export const SI_MAP_METRICS_COMMIT_MS = 280

export type SiMapMetrics = {
  latitude: number
  zoom: number
}

export function readMapMetricsFromViewState(vs: {
  latitude?: number
  zoom?: number
}): SiMapMetrics {
  return {
    latitude: typeof vs.latitude === 'number' && Number.isFinite(vs.latitude) ? vs.latitude : 0,
    zoom: typeof vs.zoom === 'number' && Number.isFinite(vs.zoom) ? vs.zoom : 2,
  }
}

export function mapMetricsChangedEnough(prev: SiMapMetrics, next: SiMapMetrics): boolean {
  return Math.abs(prev.zoom - next.zoom) >= 0.08 || Math.abs(prev.latitude - next.latitude) >= 0.25
}

export function mergeMapMetrics(prev: SiMapMetrics, next: SiMapMetrics): SiMapMetrics {
  if (!mapMetricsChangedEnough(prev, next)) return prev
  return next
}

/** Avoid React viewState commits on pan-only moveEnd (standalone map). */
export function viewStateMateriallyChanged(
  prev: { zoom?: number; pitch?: number; bearing?: number },
  next: { zoom?: number; pitch?: number; bearing?: number },
): boolean {
  const pz = typeof prev.zoom === 'number' ? prev.zoom : 2
  const nz = typeof next.zoom === 'number' ? next.zoom : 2
  if (Math.abs(pz - nz) >= 0.08) return true
  const pp = typeof prev.pitch === 'number' ? prev.pitch : 0
  const np = typeof next.pitch === 'number' ? next.pitch : 0
  if (Math.abs(pp - np) >= 1) return true
  const pb = typeof prev.bearing === 'number' ? prev.bearing : 0
  const nb = typeof next.bearing === 'number' ? next.bearing : 0
  return Math.abs(pb - nb) >= 2
}

/** Isolated dashboard embed — never refetch layers/rasters on pan/zoom. */
export function shouldFreezeViewportDataPipeline(isIsolated: boolean): boolean {
  return isIsolated
}

/**
 * Layers AOI freezes live viewport sync only after a successful clip pin exists.
 * Enabling Show on map alone must not freeze — empty pin needs viewport seed/fetch.
 */
export function shouldFreezeLayersAoiAfterClipPin(
  layersAoiEnabled: boolean,
  hasSuccessfulClipPin: boolean,
): boolean {
  return layersAoiEnabled && hasSuccessfulClipPin
}

/** Layers AOI WMS active — pin mask + tile URLs; ignore viewport bbox churn on pan/zoom. */
export function shouldFreezeLayerAoiViewportPipeline(
  layersAoiWmsActive: boolean,
  freezeViewportPipeline: boolean,
): boolean {
  return freezeViewportPipeline || layersAoiWmsActive
}

/** Skip per-frame viewport reads during pan/zoom when AOI/raster data is frozen. */
export function shouldSkipLiveViewportWorkOnMove(
  freezeViewportPipeline: boolean,
  layersAoiWmsActive = false,
): boolean {
  return shouldFreezeLayerAoiViewportPipeline(layersAoiWmsActive, freezeViewportPipeline)
}

export function bboxRefKey(bbox: LngLatBBox | null | undefined): string {
  if (!bbox) return ''
  const [west, south, east, north] = bbox
  return `${west.toFixed(3)}:${south.toFixed(3)}:${east.toFixed(3)}:${north.toFixed(3)}`
}

/** rAF-throttled callback — at most one pending frame per key (pan/zoom side effects). */
export function createFrameThrottle(): (run: () => void) => void {
  let rafId: number | null = null
  return run => {
    if (rafId != null) return
    rafId = window.requestAnimationFrame(() => {
      rafId = null
      run()
    })
  }
}
