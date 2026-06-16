/**
 * Map Geo AI vector sources (GIS Map layers + Satellite custom layers) to GeoAiMapLayer for prompts & lookup.
 */

import type { LayerData } from '../pages/satellite/components/LayerManager'
import type { GeoAiMapLayer } from './geoExplorerLayerContext'

export function gisLayerDataToGeoAiLayers(layers: LayerData[]): GeoAiMapLayer[] {
  const out: GeoAiMapLayer[] = []
  for (const l of layers) {
    if (l.type !== 'geojson' || !l.data || typeof l.data !== 'object') continue
    const fc = l.data as { type?: string; features?: unknown[] }
    if (fc.type !== 'FeatureCollection' || !Array.isArray(fc.features) || fc.features.length === 0) continue
    out.push({
      name: l.name,
      clientLayerId: String(l.id),
      visible: l.visible,
      source: l.source,
      data: l.data,
      arcgisLayerDefinition: l.arcgisLayerDefinition ?? null,
    })
  }
  return out
}

/** Satellite Intelligence custom layer rows (GeoJSON on the map). */
export function satelliteCustomLayersToGeoAiLayers(
  layers: Array<{ id: string; name: string; visible: boolean; geojson?: unknown; source?: string }>,
): GeoAiMapLayer[] {
  const out: GeoAiMapLayer[] = []
  for (const l of layers) {
    const g = l.geojson as { type?: string; features?: unknown[] } | null | undefined
    if (!g || g.type !== 'FeatureCollection' || !Array.isArray(g.features) || g.features.length === 0) continue
    out.push({
      name: l.name,
      clientLayerId: String(l.id),
      visible: l.visible,
      source: l.source,
      geojson: g,
      data: g,
      arcgisLayerDefinition: null,
    })
  }
  return out
}
