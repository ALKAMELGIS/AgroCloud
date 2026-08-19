import { featureToPrimaryAoiFeature } from './agroStructuresPrimaryAoi'
import { computeStableGisFeatureKey } from './gisFeatureStableKey'
import type { GisSelectionHit } from './gisSelection/types'
import { getDrawnGeometry } from './sentinelHubWmsAoiClip'
import type { CropAoiMode } from './siCropAoiSource'

export type CropAoiResolveLayer = {
  id: string
  geojson?: { features?: unknown[] } | null
}

export type CropAoiResolveInput = {
  mode: CropAoiMode
  layerId: string
  /** Returns west, south, east, north or null when map bounds are unavailable. */
  getViewportBounds: () => [number, number, number, number] | null
  customLayers: CropAoiResolveLayer[]
  gisSelectionHits: GisSelectionHit[]
  drawnGeometry: unknown
}

function viewportBoundsToFeatureCollection(
  west: number,
  south: number,
  east: number,
  north: number,
): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { label: 'Current map view AOI' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [west, south],
              [east, south],
              [east, north],
              [west, north],
              [west, south],
            ],
          ],
        },
      },
    ],
  }
}

function layerFeaturesToCollection(
  layerId: string,
  layers: CropAoiResolveLayer[],
): GeoJSON.FeatureCollection | null {
  const layer = layers.find(l => String(l.id) === layerId)
  const feats = layer?.geojson?.features
  if (!Array.isArray(feats) || !feats.length) return null
  const out: GeoJSON.Feature[] = []
  for (let i = 0; i < feats.length; i += 1) {
    const raw = feats[i]
    const aoi = featureToPrimaryAoiFeature(raw)
    if (!aoi?.geometry) continue
    const key = computeStableGisFeatureKey(raw, i)
    out.push({
      type: 'Feature',
      id: key,
      properties: {
        ...((aoi.properties as Record<string, unknown>) || {}),
        aoi_id: key,
        source_layer_id: layerId,
        aoiSource: 'crop-ai-layers',
      },
      geometry: aoi.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon,
    })
  }
  return out.length ? { type: 'FeatureCollection', features: out } : null
}

function selectionHitsToCollection(
  hits: GisSelectionHit[],
  layers: CropAoiResolveLayer[],
): GeoJSON.FeatureCollection | null {
  if (!hits.length) return null
  const out: GeoJSON.Feature[] = []
  for (const hit of hits) {
    const layer = layers.find(l => String(l.id) === hit.layerId)
    const arr = layer?.geojson?.features
    if (!Array.isArray(arr)) continue
    for (let i = 0; i < arr.length; i += 1) {
      const raw = arr[i] as GeoJSON.Feature
      if (computeStableGisFeatureKey(raw, i) !== hit.featureKey) continue
      const aoi = featureToPrimaryAoiFeature(raw)
      if (!aoi?.geometry) continue
      out.push({
        type: 'Feature',
        id: hit.featureKey,
        properties: {
          ...((aoi.properties as Record<string, unknown>) || {}),
          aoi_id: hit.featureKey,
          source_layer_id: hit.layerId,
          aoiSource: 'crop-ai-select',
        },
        geometry: aoi.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon,
      })
      break
    }
  }
  return out.length ? { type: 'FeatureCollection', features: out } : null
}

/** Resolve Crop AI study geometry from the active source mode. */
export function resolveCropAoiGeometry(
  input: CropAoiResolveInput,
): GeoJSON.Geometry | GeoJSON.FeatureCollection | null {
  const { mode, layerId, getViewportBounds, customLayers, gisSelectionHits, drawnGeometry } = input

  if (mode === 'viewport') {
    const b = getViewportBounds()
    if (!b) return null
    return viewportBoundsToFeatureCollection(b[0], b[1], b[2], b[3])
  }

  if (mode === 'layers') {
    const id = layerId.trim()
    if (!id) return null
    return layerFeaturesToCollection(id, customLayers)
  }

  if (mode === 'select') {
    return selectionHitsToCollection(gisSelectionHits, customLayers)
  }

  return getDrawnGeometry(drawnGeometry)
}
