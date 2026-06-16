import type { GeoExplorerMapLink } from './geoExplorerGemini'
import type { ArcgisLayerDefLite } from './arcgisAttributeDisplay'
import { geoAiFeatureCentroid } from './geoExplorerLayerContext'
import { computeStableGisFeatureKey } from './gisFeatureStableKey'

export type GeoAiCustomLayerLike = { id: string; geojson?: { type?: string; features?: unknown[] } }

/** Satellite custom layer shape: GeoJSON + optional ArcGIS schema for coded domains / subtypes. */
export type GeoAiSatelliteLayerForLink = GeoAiCustomLayerLike & {
  name?: string
  arcgisLayerDefinition?: ArcgisLayerDefLite | null
}

/** Satellite / lightweight surfaces: resolve GIS-style feature link to WGS84 centroid from in-memory GeoJSON. */
export function lngLatFromGeoAiFeatureLink(
  link: Extract<GeoExplorerMapLink, { type: 'feature' }>,
  layers: GeoAiCustomLayerLike[],
): [number, number] | null {
  const layer = layers.find(l => String(l.id) === link.layerId)
  const feats = layer?.geojson?.features
  if (!Array.isArray(feats) || !feats.length) return null
  for (let i = 0; i < feats.length; i++) {
    const f = feats[i] as { properties?: Record<string, unknown>; geometry?: unknown; id?: unknown }
    if (computeStableGisFeatureKey(f, i) !== link.featureKey) continue
    const c = geoAiFeatureCentroid(f)
    if (c) return c
  }
  return null
}

/** Resolve a chat table “feature” link to properties + ArcGIS layer definition for popups / labels. */
export function resolveGeoAiFeatureFromLink(
  link: Extract<GeoExplorerMapLink, { type: 'feature' }>,
  layers: GeoAiSatelliteLayerForLink[],
): {
  properties: Record<string, unknown>
  arcgisLayerDefinition: ArcgisLayerDefLite | null
  layerName: string
  layerId: string
} | null {
  const layer = layers.find(l => String(l.id) === link.layerId)
  const feats = layer?.geojson?.features
  if (!layer || !Array.isArray(feats)) return null
  for (let i = 0; i < feats.length; i++) {
    const f = feats[i] as { properties?: Record<string, unknown> }
    if (computeStableGisFeatureKey(f, i) !== link.featureKey) continue
    const props =
      f.properties && typeof f.properties === 'object' && !Array.isArray(f.properties)
        ? { ...(f.properties as Record<string, unknown>) }
        : {}
    const arc =
      layer.arcgisLayerDefinition && typeof layer.arcgisLayerDefinition === 'object'
        ? layer.arcgisLayerDefinition
        : null
    return {
      properties: props,
      arcgisLayerDefinition: arc,
      layerName: typeof layer.name === 'string' && layer.name.trim() ? layer.name.trim() : String(layer.id),
      layerId: String(layer.id),
    }
  }
  return null
}
