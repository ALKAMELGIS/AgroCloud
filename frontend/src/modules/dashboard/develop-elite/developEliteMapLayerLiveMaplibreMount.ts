import type { Map as MaplibreMap, RasterSourceSpecification } from 'maplibre-gl'
import { resolveSiSentinelAoiWmsBoundsLngLat } from '@/modules/remote-sensing/imagery/siSentinelAoiWmsStack'
import { SI_SENTINEL_WMS_MAP_DISPLAY_MIN_ZOOM } from '@/modules/remote-sensing/imagery/sentinelHubWmsLayers'
import { resolveDevelopEliteLayerLiveAoiImageUrl } from './developEliteMapLayerLiveAoiImage'
import type { DevelopEliteLayerLiveTilePlan } from './developEliteMapLayerLiveCore'
import {
  developEliteMapLibreHasLayer,
  developEliteMapLibreRunIfStyleReady,
  isDevelopEliteMapLibreStyleReady,
} from './developEliteMapLibreStyle'
import { DE_LAYER_LIVE_TILE_URL_TEMPLATE } from './developEliteMapLayerLiveMaplibreProtocol'

const SRC_IMAGE = 'de-layer-live-aoi-image'
const LAYER_IMAGE = 'de-layer-live-aoi-image-raster'
const SRC_TILES = 'de-layer-live-wms-tiles'
const LAYER_TILES = 'de-layer-live-wms-tiles-raster'

export const DE_MAPLIBRE_LAYER_LIVE_RASTER_LAYER_IDS = [LAYER_IMAGE, LAYER_TILES] as const

const layerLiveVisibilityBeforePause = new WeakMap<MaplibreMap, Map<string, string>>()

export function setDevelopEliteLayerLiveMaplibreInteractionPaused(
  map: MaplibreMap,
  paused: boolean,
): void {
  if (paused) {
    const snapshot = new Map<string, string>()
    for (const id of DE_MAPLIBRE_LAYER_LIVE_RASTER_LAYER_IDS) {
      if (!developEliteMapLibreHasLayer(map, id)) continue
      try {
        const vis = map.getLayoutProperty(id, 'visibility')
        snapshot.set(id, typeof vis === 'string' ? vis : 'visible')
        map.setLayoutProperty(id, 'visibility', 'none')
      } catch {
        /* ignore */
      }
    }
    layerLiveVisibilityBeforePause.set(map, snapshot)
    return
  }
  const snapshot = layerLiveVisibilityBeforePause.get(map)
  layerLiveVisibilityBeforePause.delete(map)
  for (const id of DE_MAPLIBRE_LAYER_LIVE_RASTER_LAYER_IDS) {
    if (!developEliteMapLibreHasLayer(map, id)) continue
    const restore = snapshot?.get(id) ?? 'visible'
    try {
      map.setLayoutProperty(id, 'visibility', restore)
    } catch {
      /* ignore */
    }
  }
}

export {
  DE_LAYER_LIVE_TILE_PLACEHOLDER_PNG,
  DE_LAYER_LIVE_TILE_PROTOCOL,
} from './developEliteMapLayerLiveMaplibreProtocol'

export type DevelopEliteLayerLiveMaplibreMount = {
  imageUrl: string | null
  tileTemplate: string | null
}

function lngLatBoxToImageCoords(box: [number, number, number, number]): [
  [number, number],
  [number, number],
  [number, number],
  [number, number],
] {
  const [w, s, e, n] = box
  return [[w, n], [e, n], [e, s], [w, s]]
}

export function clearDevelopEliteLayerLiveMaplibre(map: MaplibreMap): void {
  try {
    if (!isDevelopEliteMapLibreStyleReady(map)) return
    if (developEliteMapLibreHasLayer(map, LAYER_TILES)) map.removeLayer(LAYER_TILES)
    if (developEliteMapLibreHasLayer(map, LAYER_IMAGE)) map.removeLayer(LAYER_IMAGE)
    if (map.getSource(SRC_TILES)) map.removeSource(SRC_TILES)
    if (map.getSource(SRC_IMAGE)) map.removeSource(SRC_IMAGE)
  } catch {
    /* map removed or style swapped */
  }
  ;(globalThis as { __deLayerLiveWmsTemplate?: string }).__deLayerLiveWmsTemplate = undefined
}

export function syncDevelopEliteLayerLiveMaplibre(
  map: MaplibreMap,
  options: {
    plans: DevelopEliteLayerLiveTilePlan[]
    clipSource: unknown
    opacity: number
  },
): DevelopEliteLayerLiveMaplibreMount {
  if (!isDevelopEliteMapLibreStyleReady(map)) {
    return { imageUrl: null, tileTemplate: null }
  }
  const { plans, clipSource, opacity } = options
  if (!plans.length) {
    clearDevelopEliteLayerLiveMaplibre(map)
    return { imageUrl: null, tileTemplate: null }
  }

  let result: DevelopEliteLayerLiveMaplibreMount = { imageUrl: null, tileTemplate: null }
  developEliteMapLibreRunIfStyleReady(map, map => {
  const aoiBounds = resolveSiSentinelAoiWmsBoundsLngLat(clipSource)
  const useAoiImage = Boolean(aoiBounds && plans[0]?.url)
  const tilePlan = useAoiImage ? plans[1] ?? plans[0] : plans[0]
  const tileTemplate = tilePlan?.url ?? null

  if (useAoiImage && aoiBounds && plans[0]?.url) {
    const imageUrl = resolveDevelopEliteLayerLiveAoiImageUrl(plans[0].url, aoiBounds)
    const coords = lngLatBoxToImageCoords(aoiBounds)
    if (map.getSource(SRC_IMAGE)) {
      const src = map.getSource(SRC_IMAGE) as { updateImage?: (o: { url: string; coordinates: typeof coords }) => void }
      src.updateImage?.({ url: imageUrl, coordinates: coords })
    } else {
      map.addSource(SRC_IMAGE, {
        type: 'image',
        url: imageUrl,
        coordinates: coords,
      })
    }
    if (!developEliteMapLibreHasLayer(map, LAYER_IMAGE)) {
      map.addLayer({
        id: LAYER_IMAGE,
        type: 'raster',
        source: SRC_IMAGE,
        paint: { 'raster-opacity': opacity, 'raster-fade-duration': 0 },
      })
    } else {
      map.setPaintProperty(LAYER_IMAGE, 'raster-opacity', opacity)
    }
  } else if (developEliteMapLibreHasLayer(map, LAYER_IMAGE)) {
    map.removeLayer(LAYER_IMAGE)
    if (map.getSource(SRC_IMAGE)) map.removeSource(SRC_IMAGE)
  }

  if (tileTemplate) {
    ;(globalThis as { __deLayerLiveWmsTemplate?: string }).__deLayerLiveWmsTemplate = tileTemplate
    const rasterSpec: RasterSourceSpecification = {
      type: 'raster',
      tiles: [DE_LAYER_LIVE_TILE_URL_TEMPLATE],
      tileSize: 512,
      minzoom: SI_SENTINEL_WMS_MAP_DISPLAY_MIN_ZOOM,
      maxzoom: 22,
    }
    if (map.getSource(SRC_TILES)) {
      const src = map.getSource(SRC_TILES) as { setTiles?: (t: string[]) => void }
      src.setTiles?.(rasterSpec.tiles as string[])
    } else {
      map.addSource(SRC_TILES, rasterSpec)
    }
    if (!developEliteMapLibreHasLayer(map, LAYER_TILES)) {
      map.addLayer({
        id: LAYER_TILES,
        type: 'raster',
        source: SRC_TILES,
        paint: { 'raster-opacity': opacity, 'raster-fade-duration': 0 },
      })
    } else {
      map.setPaintProperty(LAYER_TILES, 'raster-opacity', opacity)
    }
  } else {
    if (developEliteMapLibreHasLayer(map, LAYER_TILES)) map.removeLayer(LAYER_TILES)
    if (map.getSource(SRC_TILES)) map.removeSource(SRC_TILES)
  }

  result = {
    imageUrl: useAoiImage && aoiBounds ? resolveDevelopEliteLayerLiveAoiImageUrl(plans[0]!.url, aoiBounds) : null,
    tileTemplate,
  }
  })
  return result
}
