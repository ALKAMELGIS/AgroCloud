import type { GeoExplorerMapLink } from './geoExplorerGemini'
import { computeStableGisFeatureKey } from './gisFeatureStableKey'
import { geoAiFeatureCentroid } from './geoExplorerLayerContext'
import type { GeoAiSatelliteLayerForLink } from './geoAiResolveTableMapLink'

export function stableFeatureLinkKey(link: GeoExplorerMapLink): string | null {
  if (link.type !== 'feature') return null
  return `${link.layerId}::${link.featureKey}`
}

/** Evenly subsample links so the map does not rebuild huge GeoJSON every frame (table keeps full selection). */
export function sampleGeoAiMapSelectionLinks(links: GeoExplorerMapLink[], max: number): GeoExplorerMapLink[] {
  if (links.length <= max) return links
  const step = links.length / max
  const out: GeoExplorerMapLink[] = []
  for (let i = 0; i < max; i++) {
    const idx = Math.min(links.length - 1, Math.floor(i * step))
    out.push(links[idx]!)
  }
  return out
}

export type GeoJsonFeatureLike = { type?: string; geometry?: unknown; properties?: Record<string, unknown> }

/** Build a FeatureCollection for map highlight from resolved layer geometries (vectors / raster-as-polygons). */
export function buildGeoAiLinkedHighlightCollection(
  links: GeoExplorerMapLink[],
  layers: GeoAiSatelliteLayerForLink[],
): { type: 'FeatureCollection'; features: Array<{ type: 'Feature'; geometry: unknown; properties: Record<string, unknown> }> } {
  const feats: Array<{ type: 'Feature'; geometry: unknown; properties: Record<string, unknown> }> = []
  const seen = new Set<string>()
  for (const link of links) {
    if (link.type !== 'feature') continue
    const k = stableFeatureLinkKey(link)
    if (!k || seen.has(k)) continue
    const layer = layers.find(l => String(l.id) === link.layerId)
    const arr = layer?.geojson?.features
    if (!Array.isArray(arr)) continue
    for (let i = 0; i < arr.length; i++) {
      const f = arr[i] as GeoJsonFeatureLike
      if (computeStableGisFeatureKey(f, i) !== link.featureKey) continue
      const g = f.geometry
      if (!g || typeof g !== 'object') break
      feats.push({
        type: 'Feature',
        geometry: g,
        properties: { _geoAiHL: true, ...(f.properties && typeof f.properties === 'object' ? f.properties : {}) },
      })
      seen.add(k)
      break
    }
  }
  return { type: 'FeatureCollection', features: feats }
}

/** Point-only fallback when a row has coords link but no polygon. */
export function buildGeoAiCoordsHighlightPoints(
  links: GeoExplorerMapLink[],
): { type: 'FeatureCollection'; features: Array<{ type: 'Feature'; geometry: unknown; properties: Record<string, unknown> }> } {
  const feats: Array<{ type: 'Feature'; geometry: unknown; properties: Record<string, unknown> }> = []
  for (const link of links) {
    if (link.type !== 'coords') continue
    if (!Number.isFinite(link.lng) || !Number.isFinite(link.lat)) continue
    feats.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [link.lng, link.lat] },
      properties: { _geoAiHL: true },
    })
  }
  return { type: 'FeatureCollection', features: feats }
}

export function centroidForFeatureLink(
  link: Extract<GeoExplorerMapLink, { type: 'feature' }>,
  layers: GeoAiSatelliteLayerForLink[],
): [number, number] | null {
  const layer = layers.find(l => String(l.id) === link.layerId)
  const arr = layer?.geojson?.features
  if (!Array.isArray(arr)) return null
  for (let i = 0; i < arr.length; i++) {
    const f = arr[i] as GeoJsonFeatureLike
    if (computeStableGisFeatureKey(f, i) !== link.featureKey) continue
    const c = geoAiFeatureCentroid(f as any)
    return c ?? null
  }
  return null
}
