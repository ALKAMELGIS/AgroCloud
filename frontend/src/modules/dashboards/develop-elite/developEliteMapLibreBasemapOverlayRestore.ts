import type { Map as MaplibreMap } from 'maplibre-gl'
import {
  clearDevelopEliteMapLibreOverlaysInteractionPaused,
  DE_MAPLIBRE_OVERLAY_LAYER_IDS,
} from './developEliteMapLibreOverlays'
import { developEliteMapLibreHasLayer } from './developEliteMapLibreStyle'
import { clearDevelopEliteLayerLiveMaplibreInteractionPaused } from './developEliteMapLayerLiveMaplibreMount'

export const DEVELOP_ELITE_MAP_BASEMAP_APPLIED_EVENT = 'develop-elite-map-basemap-applied'

/** Clears gesture-hide state so overlay sync is not blocked after `setStyle`. */
export function prepareDevelopEliteMapLibreForBasemapChange(map: MaplibreMap | null | undefined): void {
  if (!map) return
  clearDevelopEliteMapLibreOverlaysInteractionPaused(map)
  clearDevelopEliteLayerLiveMaplibreInteractionPaused(map)
}

export function dispatchDevelopEliteMapBasemapApplied(basemapId: string): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent<{ basemapId: string }>(DEVELOP_ELITE_MAP_BASEMAP_APPLIED_EVENT, {
      detail: { basemapId },
    }),
  )
}

/** Keep all basemap raster layers at the bottom of the stack. */
export function developEliteMapLibrePinBasemapRasterBottom(map: MaplibreMap): void {
  try {
    const layers = map.getStyle()?.layers ?? []
    if (layers.length < 2) return
    const firstId = layers[0]?.id
    if (!firstId) return
    for (const layer of layers) {
      if (layer.type !== 'raster') continue
      if (layer.id === firstId) continue
      map.moveLayer(layer.id, firstId)
    }
  } catch {
    /* ignore */
  }
}

/** Move GIS overlay layers above any basemap / Layer Live rasters. */
export function developEliteMapLibreRaiseOverlaysAboveBasemap(map: MaplibreMap): void {
  for (const id of DE_MAPLIBRE_OVERLAY_LAYER_IDS) {
    if (!developEliteMapLibreHasLayer(map, id)) continue
    try {
      map.moveLayer(id)
    } catch {
      /* style race */
    }
  }
}

export function scheduleDevelopEliteMapLibreOverlayResyncAfterBasemap(
  map: MaplibreMap,
  resync: () => void,
): () => void {
  let cancelled = false
  const run = () => {
    if (cancelled) return
    prepareDevelopEliteMapLibreForBasemapChange(map)
    developEliteMapLibrePinBasemapRasterBottom(map)
    resync()
    developEliteMapLibreRaiseOverlaysAboveBasemap(map)
  }
  run()
  const raf = requestAnimationFrame(() => {
    if (cancelled) return
    run()
  })
  const onIdle = () => {
    if (cancelled) return
    run()
  }
  map.once('idle', onIdle)
  const timer = window.setTimeout(() => {
    if (cancelled) return
    run()
  }, 80)

  return () => {
    cancelled = true
    cancelAnimationFrame(raf)
    map.off('idle', onIdle)
    window.clearTimeout(timer)
  }
}
