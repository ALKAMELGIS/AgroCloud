import { tileCoordsToBboxEpsg3857 } from '@/modules/remote-sensing/imagery/sentinelHubWmsLeaflet'

/** @deprecated Legacy custom scheme — still parsed and registered via addProtocol. */
export const DE_LAYER_LIVE_TILE_PROTOCOL = 'de-layer-live-tile://'

/** 1×1 transparent PNG — safe tile placeholder when the WMS template is not mounted yet. */
export const DE_LAYER_LIVE_TILE_PLACEHOLDER_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

/** Fake HTTPS host — never resolved; MapLibre rewrites via transformRequest. */
export const DE_LAYER_LIVE_TILE_HOST = 'develop-elite.layer-live.local'

/** Raster source template (must stay on https — custom schemes break MapLibre abort handling). */
export const DE_LAYER_LIVE_TILE_URL_TEMPLATE = `https://${DE_LAYER_LIVE_TILE_HOST}/tiles/{z}/{x}/{y}`

type Zxy = { z: number; x: number; y: number }

function readWmsTemplate(): string | undefined {
  return (globalThis as { __deLayerLiveWmsTemplate?: string }).__deLayerLiveWmsTemplate
}

function parseZxyFromPath(pathname: string): Zxy | null {
  const parts = pathname.replace(/^\/+/, '').split('/').filter(Boolean)
  const tail = parts.length >= 3 ? parts.slice(-3) : parts
  if (tail.length !== 3) return null
  const z = Number(tail[0])
  const x = Number(tail[1])
  const y = Number(tail[2])
  if (!Number.isFinite(z) || !Number.isFinite(x) || !Number.isFinite(y)) return null
  return { z, x, y }
}

export function parseDevelopEliteLayerLiveTileZxy(url: string): Zxy | null {
  if (url.startsWith(DE_LAYER_LIVE_TILE_PROTOCOL)) {
    const parts = url.slice(DE_LAYER_LIVE_TILE_PROTOCOL.length).split('/')
    if (parts.length !== 3) return null
    const z = Number(parts[0])
    const x = Number(parts[1])
    const y = Number(parts[2])
    if (!Number.isFinite(z) || !Number.isFinite(x) || !Number.isFinite(y)) return null
    return { z, x, y }
  }
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== DE_LAYER_LIVE_TILE_HOST) return null
    return parseZxyFromPath(parsed.pathname)
  } catch {
    return null
  }
}

export function isDevelopEliteLayerLiveTileUrl(url: string): boolean {
  return parseDevelopEliteLayerLiveTileZxy(url) != null
}

/** Resolve a Layer Live tile request to a fetchable WMS URL, or null when the template is not ready. */
export function resolveDevelopEliteLayerLiveWmsTileUrl(url: string): string | null {
  const zxy = parseDevelopEliteLayerLiveTileZxy(url)
  if (!zxy) return null
  const template = readWmsTemplate()
  if (!template) return null
  const bbox = tileCoordsToBboxEpsg3857(zxy.x, zxy.y, zxy.z)
  return template.replace('{bbox-epsg-3857}', bbox)
}

/** URL passed to fetch / transformRequest (WMS, data-URL placeholder, or null). */
export function resolveDevelopEliteLayerLiveTileFetchUrl(url: string): string | null {
  const wms = resolveDevelopEliteLayerLiveWmsTileUrl(url)
  if (wms) return wms
  if (isDevelopEliteLayerLiveTileUrl(url)) return DE_LAYER_LIVE_TILE_PLACEHOLDER_PNG
  return null
}

/** @deprecated Use {@link resolveDevelopEliteLayerLiveWmsTileUrl} — kept for transformRequest call sites. */
export function developEliteLayerLiveTileUrlFromProtocol(url: string): string | null {
  return resolveDevelopEliteLayerLiveWmsTileUrl(url)
}
