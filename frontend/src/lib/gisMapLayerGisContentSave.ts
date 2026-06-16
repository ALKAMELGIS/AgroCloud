import type { GisContentRow } from '../pages/master/gisContentPortalData'
import {
  GIS_HOSTED_FEATURE_LAYERS_FOLDER_ID,
  type GisHostedFeatureLayerGeoJson,
  type GisHostedFeatureLayerSourceMethod,
} from './gisHostedFeatureLayerPortal'
import { parseGisContentPortalLayerUrl } from './gisContentPortalTableUtils'
import { upsertGisContentPortalHostedFeatureLayer } from './gisContentPortalStore'

export function geoJsonForGisContentLayerSave(data: unknown): GisHostedFeatureLayerGeoJson | null {
  if (!data || typeof data !== 'object') return null
  const candidate = data as GisHostedFeatureLayerGeoJson
  if (candidate.type !== 'FeatureCollection' || !Array.isArray(candidate.features)) return null
  return candidate
}

/** Persist a map vector layer as a hosted feature layer in GIS Content. */
export function saveMapVectorLayerToGisContent(input: {
  layerName: string
  layerUrl?: string
  geojson: GisHostedFeatureLayerGeoJson
  mode: 'save' | 'saveAs'
  title?: string
  sourceMethod?: GisHostedFeatureLayerSourceMethod
}): GisContentRow {
  const existingId =
    input.mode === 'save' ? parseGisContentPortalLayerUrl(String(input.layerUrl ?? '')) ?? undefined : undefined

  return upsertGisContentPortalHostedFeatureLayer({
    id: existingId,
    title: (input.title ?? input.layerName).trim() || 'Untitled layer',
    geojson: input.geojson,
    sourceMethod: input.sourceMethod ?? 'map-viewer',
    folderId: GIS_HOSTED_FEATURE_LAYERS_FOLDER_ID,
  })
}
