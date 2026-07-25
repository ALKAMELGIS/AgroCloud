/**
 * Zero-flicker helpers for Sentinel AOI WMS raster stacks on Mapbox GL.
 * Sources stay mounted; visibility toggles show/hide; tile URLs swap in-place.
 */

import type { Map as MapboxMap } from 'mapbox-gl'

export type SiSentinelRasterSourceMutable = {
  setTiles?: (tiles: string[]) => void
  setBounds?: (bounds: [number, number, number, number] | null) => void
}

export function siSentinelAoiWmsChunkKey(idPrefix: string, chunkIdx: number): string {
  return `${idPrefix}:${chunkIdx}`
}

export function safeSiSentinelRasterSetTiles(
  source: SiSentinelRasterSourceMutable | null | undefined,
  tiles: string[],
): boolean {
  if (!source || typeof source.setTiles !== 'function') return false
  try {
    source.setTiles(tiles)
    return true
  } catch {
    return false
  }
}

export function safeSiSentinelRasterSetBounds(
  source: SiSentinelRasterSourceMutable | null | undefined,
  bounds: [number, number, number, number] | null | undefined,
): void {
  if (!source || typeof source.setBounds !== 'function') return
  try {
    source.setBounds(bounds ?? null)
  } catch {
    /* source detached */
  }
}

/** Apply in-place tile URL swap only when the template changed. */
export function syncSiSentinelAoiWmsChunkTiles(
  source: SiSentinelRasterSourceMutable | null | undefined,
  nextUrl: string,
  appliedUrls: Map<string, string>,
  chunkKey: string,
): boolean {
  const url = String(nextUrl || '').trim()
  if (!url || appliedUrls.get(chunkKey) === url) return false
  if (!safeSiSentinelRasterSetTiles(source, [url])) return false
  appliedUrls.set(chunkKey, url)
  return true
}

/** Apply bounds only when the tuple changed — avoids redundant tile cache invalidation. */
export function syncSiSentinelAoiWmsChunkBounds(
  source: SiSentinelRasterSourceMutable | null | undefined,
  nextBounds: [number, number, number, number] | null | undefined,
  appliedBounds: Map<string, string>,
  chunkKey: string,
): void {
  const key = nextBounds ? nextBounds.join(',') : ''
  if (appliedBounds.get(chunkKey) === key) return
  safeSiSentinelRasterSetBounds(source, nextBounds ?? null)
  appliedBounds.set(chunkKey, key)
}

/**
 * Show/hide via raster-opacity only (layout stays `visible`).
 * Matching Edit AOI React layers: Mapbox keeps fetching tiles at opacity 0,
 * so warm prefetch makes Show on map (Layers AOI) near-instant.
 * Use `unloadWhenHidden` only when tearing down / freeing GPU for unused stacks.
 */
export function setSiSentinelAoiWmsLayerPresentation(
  map: MapboxMap,
  layerId: string,
  visible: boolean,
  opacity: number,
  evalscriptChunk: boolean,
  options?: { unloadWhenHidden?: boolean },
): void {
  if (!map.getLayer(layerId)) return
  const targetOpacity = visible ? opacity * (evalscriptChunk ? 1 : 0.96) : 0
  const layoutVisible = visible || !options?.unloadWhenHidden
  try {
    map.setLayoutProperty(layerId, 'visibility', layoutVisible ? 'visible' : 'none')
    map.setPaintProperty(layerId, 'raster-opacity', targetOpacity)
    map.setPaintProperty(layerId, 'raster-fade-duration', 0)
    map.setPaintProperty(layerId, 'raster-resampling', 'linear')
  } catch {
    /* ignore map/source race */
  }
}
