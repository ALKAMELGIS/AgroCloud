import L from 'leaflet'
import type { ImageOverlay, Map as LeafletMap, TileLayer } from 'leaflet'
import { resolveSiSentinelAoiWmsBoundsLngLat } from '@/modules/remote-sensing/imagery/siSentinelAoiWmsStack'
import { SI_SENTINEL_WMS_MAP_DISPLAY_MIN_ZOOM } from '@/modules/remote-sensing/imagery/sentinelHubWmsLayers'
import {
  createSentinelHubBboxTileLayer,
  updateSentinelHubBboxTileLayerUrl,
} from '@/modules/remote-sensing/imagery/sentinelHubWmsLeaflet'
import { resolveDevelopEliteLayerLiveAoiImageUrl } from './developEliteMapLayerLiveAoiImage'
import type { DevelopEliteLayerLiveTilePlan } from './developEliteMapLayerLiveCore'

export type DevelopEliteLayerLiveMountedEntry =
  | { kind: 'image'; layer: ImageOverlay; url: string; planIndex: number }
  | { kind: 'tiles'; layer: TileLayer; url: string; planIndex: number }

function leafletBoundsFromLngLatBox(box: [number, number, number, number]): L.LatLngBounds {
  const [w, s, e, n] = box
  return L.latLngBounds([s, w], [n, e])
}

export function clearDevelopEliteLayerLiveMounted(map: LeafletMap, mounted: DevelopEliteLayerLiveMountedEntry[]) {
  for (const entry of mounted) {
    map.removeLayer(entry.layer)
  }
}

/**
 * Paint index inside drawn AOI: one WMS image for the first chunk (dataMask clip),
 * tile layers for additional chunks — same pattern as Develop Elite swipe.
 */
export function syncDevelopEliteLayerLiveMounted(
  map: LeafletMap,
  options: {
    pane: string
    plans: DevelopEliteLayerLiveTilePlan[]
    clipSource: unknown
    latitudeDeg: number
    opacity: number
  },
  prev: DevelopEliteLayerLiveMountedEntry[],
): DevelopEliteLayerLiveMountedEntry[] {
  const { pane, plans, clipSource, latitudeDeg, opacity } = options
  if (!plans.length) {
    clearDevelopEliteLayerLiveMounted(map, prev)
    return []
  }

  const aoiBounds = resolveSiSentinelAoiWmsBoundsLngLat(clipSource)
  const next: DevelopEliteLayerLiveMountedEntry[] = []

  const useAoiImage = Boolean(aoiBounds && plans[0]?.url)
  const tilePlanStart = useAoiImage ? 1 : 0

  if (useAoiImage && aoiBounds) {
    const imageUrl = resolveDevelopEliteLayerLiveAoiImageUrl(plans[0]!.url, aoiBounds)
    const existing = prev.find(e => e.kind === 'image' && e.planIndex === 0)
    if (existing?.kind === 'image' && existing.url === imageUrl && map.hasLayer(existing.layer)) {
      existing.layer.setOpacity(opacity)
      next.push(existing)
    } else {
      if (existing?.kind === 'image') map.removeLayer(existing.layer)
      const overlay = L.imageOverlay(imageUrl, leafletBoundsFromLngLatBox(aoiBounds), {
        pane,
        opacity,
        interactive: false,
        className: 'develop-elite-layer-live-aoi-image',
      })
      overlay.addTo(map)
      next.push({ kind: 'image', layer: overlay, url: imageUrl, planIndex: 0 })
    }
  }

  for (let planIndex = tilePlanStart; planIndex < plans.length; planIndex++) {
    const plan = plans[planIndex]!
    const existing = prev.find(e => e.kind === 'tiles' && e.planIndex === planIndex)
    if (existing?.kind === 'tiles' && map.hasLayer(existing.layer)) {
      if (existing.url !== plan.url) {
        updateSentinelHubBboxTileLayerUrl(existing.layer, plan.url)
      }
      existing.layer.setOpacity(opacity)
      next.push({ ...existing, url: plan.url })
      continue
    }
    if (existing?.kind === 'tiles') map.removeLayer(existing.layer)

    const layer = createSentinelHubBboxTileLayer(plan.url, {
      pane,
      opacity,
      stableDuringInteraction: true,
      minZoom: SI_SENTINEL_WMS_MAP_DISPLAY_MIN_ZOOM,
      latitudeDeg,
      crossOrigin: null,
    })
    layer.addTo(map)
    next.push({ kind: 'tiles', layer, url: plan.url, planIndex })
  }

  // Single-chunk AOI with no bounds: tile fallback
  if (!next.length && plans[0]?.url) {
    const layer = createSentinelHubBboxTileLayer(plans[0].url, {
      pane,
      opacity,
      stableDuringInteraction: true,
      minZoom: SI_SENTINEL_WMS_MAP_DISPLAY_MIN_ZOOM,
      latitudeDeg,
      crossOrigin: null,
    })
    layer.addTo(map)
    next.push({ kind: 'tiles', layer, url: plans[0].url, planIndex: 0 })
  }

  for (const entry of prev) {
    if (!next.some(n => n.kind === entry.kind && n.planIndex === entry.planIndex)) {
      map.removeLayer(entry.layer)
    }
  }

  return next
}
