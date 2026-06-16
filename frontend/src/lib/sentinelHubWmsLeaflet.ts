import L from 'leaflet'
import {
  SENTINEL_HUB_WMS_TILE_PIXELS,
  sentinelHubWmsMinZoomForLatitude,
} from './sentinelHubWmsLayers'

const EARTH_CIRCUMFERENCE = 40_075_016.685_578_49
const ORIGIN = EARTH_CIRCUMFERENCE / 2

/** CSS class for bilinear-smoothed Sentinel WMS tiles in Leaflet map canvas. */
export const SENTINEL_HUB_WMS_TILE_CLASS = 'sentinel-hub-wms-tile'

/** Web Mercator tile bounds for Sentinel Hub WMS `{bbox-epsg-3857}` placeholder. */
export function tileCoordsToBboxEpsg3857(x: number, y: number, z: number): string {
  const n = 2 ** z
  const minX = (x / n) * EARTH_CIRCUMFERENCE - ORIGIN
  const maxX = ((x + 1) / n) * EARTH_CIRCUMFERENCE - ORIGIN
  const maxY = ORIGIN - (y / n) * EARTH_CIRCUMFERENCE
  const minY = ORIGIN - ((y + 1) / n) * EARTH_CIRCUMFERENCE
  return `${minX},${minY},${maxX},${maxY}`
}

export type SentinelHubLeafletTileLayerOptions = {
  opacity?: number
  zIndex?: number
  pane?: string
  /** Sentinel-2 WMS tiles only fetch at/above this Leaflet zoom (extend zoom). */
  minZoom?: number
  /** Limit tile fetches to this WGS84 extent (south-west / north-east). */
  bounds?: L.LatLngBoundsExpression
  /** Keep loaded tiles during pan/zoom; refresh when interaction ends. */
  stableDuringInteraction?: boolean
  /** Map latitude — aligns tile pixel size with Sentinel-2 GSD at current zoom. */
  latitudeDeg?: number
}

/**
 * Tile pixels for WMS GetMap — 512px matches Mapbox grid; clamped so zoom ≥ min Sentinel zoom.
 */
export function resolveSentinelHubWmsTilePixelsForZoom(
  mapZoom: number,
  latitudeDeg: number,
): number {
  const minZ = sentinelHubWmsMinZoomForLatitude(latitudeDeg)
  if (!Number.isFinite(mapZoom) || mapZoom < minZ) return SENTINEL_HUB_WMS_TILE_PIXELS
  return SENTINEL_HUB_WMS_TILE_PIXELS
}

/** Leaflet raster source for Sentinel Hub OGC WMS GetMap with per-tile EPSG:3857 BBOX. */
export function createSentinelHubBboxTileLayer(
  urlTemplate: string,
  options: SentinelHubLeafletTileLayerOptions = {},
): L.TileLayer {
  const layer = L.tileLayer('', {
    tileSize: SENTINEL_HUB_WMS_TILE_PIXELS,
    zoomOffset: -1,
    minZoom: options.minZoom ?? 0,
    maxZoom: 22,
    crossOrigin: 'anonymous',
    updateWhenIdle: options.stableDuringInteraction ?? false,
    updateWhenZooming: options.stableDuringInteraction ? false : true,
    keepBuffer: options.stableDuringInteraction ? 8 : 5,
    className: SENTINEL_HUB_WMS_TILE_CLASS,
    ...(options.pane ? { pane: options.pane } : {}),
    ...(options.bounds ? { bounds: options.bounds } : {}),
  })

  layer.getTileUrl = function getTileUrl(coords: L.Coords) {
    const bbox = tileCoordsToBboxEpsg3857(coords.x, coords.y, coords.z)
    return urlTemplate.replace('{bbox-epsg-3857}', bbox)
  }

  stampSentinelHubBboxTileLayerUrl(layer, urlTemplate)

  layer.createTile = function createTile(this: L.TileLayer, coords: L.Coords, done: L.DoneCallback) {
    const el = L.DomUtil.create('img', '') as HTMLImageElement
    el.alt = ''
    el.className = SENTINEL_HUB_WMS_TILE_CLASS
    el.setAttribute('role', 'presentation')
    el.style.imageRendering = 'auto'

    const onLoad = () => {
      ;(this as L.TileLayer & { _tileOnLoad: (d: L.DoneCallback, t: HTMLElement) => void })._tileOnLoad(done, el)
    }
    const onError = () => {
      ;(this as L.TileLayer & { _tileOnError: (d: L.DoneCallback, t: HTMLElement) => void })._tileOnError(done, el)
    }

    el.onload = onLoad
    el.onerror = onError
    el.src = this.getTileUrl(coords)
    return el
  }

  if (options.opacity != null) layer.setOpacity(options.opacity)
  if (options.zIndex != null) layer.setZIndex(options.zIndex)
  return layer
}

type SentinelHubTileLayerWithTemplate = L.TileLayer & {
  _sentinelUrlTemplate?: string
}

/** Update WMS URL template in-place — keeps cached tiles during layer/date changes. */
export function updateSentinelHubBboxTileLayerUrl(layer: L.TileLayer, urlTemplate: string): boolean {
  const typed = layer as SentinelHubTileLayerWithTemplate
  if (typed._sentinelUrlTemplate === urlTemplate) return false
  typed._sentinelUrlTemplate = urlTemplate
  typed.getTileUrl = function getTileUrl(coords: L.Coords) {
    const bbox = tileCoordsToBboxEpsg3857(coords.x, coords.y, coords.z)
    return urlTemplate.replace('{bbox-epsg-3857}', bbox)
  }
  layer.redraw()
  return true
}

/** Attach template ref on create for in-place updates. */
export function stampSentinelHubBboxTileLayerUrl(layer: L.TileLayer, urlTemplate: string): L.TileLayer {
  ;(layer as SentinelHubTileLayerWithTemplate)._sentinelUrlTemplate = urlTemplate
  return layer
}
