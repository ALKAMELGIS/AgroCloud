import { fetchArcGisFeatureLayerGeoJson } from '../../../../lib/arcgisFeatureLayerGeoJson'
import { buildAcpOgcLayerMetadata } from '../../../../lib/acpOgcLayerMeta'
import type { GisHostedFeatureLayerGeoJson } from '../../../../lib/gisHostedFeatureLayerPortal'
import {
  persistArcGisHostedFeatureLayerToGisContentPortal,
  publishGisContentNewItem,
} from '../../../../lib/gisContentPortalPublish'
import {
  getGisContentItemDetails,
  registerGisContentMapLayer,
  upsertGisContentPortalHostedFeatureLayer,
  upsertGisContentPortalItem,
} from '../../../../lib/gisContentPortalStore'
import type { GisContentRow } from '../../../master/gisContentPortalData'
import { mergeShpLikeToFeatureCollection, normalizeGeoJsonEnvelope, parseFile, parseRemoteUrlAsFile } from '../../../../utils/FileLoader'
import { addAcpGisPortalRowToMap } from './acpGisPortalActions'

export type AcpIngestLayerResult = {
  row: GisContentRow
  message: string
  geojson?: GeoJSON.FeatureCollection | null
  isAgroStructures?: boolean
}

async function parseUploadToGeoJson(file: File): Promise<GisHostedFeatureLayerGeoJson> {
  const parsed = await parseFile(file)
  if (parsed.type !== 'geojson') {
    throw new Error('File must contain GIS features (GeoJSON, KML, KMZ, Shapefile zip, or CSV with coordinates).')
  }
  let geojson: unknown = parsed.data
  if (Array.isArray(geojson)) geojson = geojson[0]
  const normalized = normalizeGeoJsonEnvelope(mergeShpLikeToFeatureCollection(geojson))
  if (!normalized.features.length) {
    throw new Error('No drawable features found in the uploaded file.')
  }
  return normalized as GisHostedFeatureLayerGeoJson
}

function registerAndReturn(row: GisContentRow, message: string): AcpIngestLayerResult {
  registerGisContentMapLayer(row.id)
  return { row, message }
}

export async function ingestAcpLayerFromUpload(file: File, title?: string): Promise<AcpIngestLayerResult> {
  const geojson = await parseUploadToGeoJson(file)
  const layerTitle = title?.trim() || file.name.replace(/\.[^.]+$/, '').trim() || 'Uploaded layer'
  const row = await publishGisContentNewItem({ type: 'upload', title: layerTitle, file })
  return registerAndReturn(row, `Added "${row.title}" to the map.`)
}

export async function ingestAcpLayerFromUrl(url: string, title?: string): Promise<AcpIngestLayerResult> {
  const trimmed = url.trim()
  if (!trimmed) throw new Error('Enter a data URL.')
  const file = await parseRemoteUrlAsFile(trimmed)
  const geojson = await parseUploadToGeoJson(file)
  const layerTitle = title?.trim() || file.name.replace(/\.[^.]+$/, '').trim() || 'URL layer'
  const row = upsertGisContentPortalHostedFeatureLayer({
    title: layerTitle,
    geojson,
    sourceMethod: 'url',
    folderId: 'all',
  })
  return registerAndReturn(row, `Added "${row.title}" from URL.`)
}

export async function ingestAcpLayerFromArcGisRest(input: {
  layerUrl: string
  title?: string
  token?: string
}): Promise<AcpIngestLayerResult> {
  const layerUrl = input.layerUrl.trim().replace(/\/+$/, '')
  if (!layerUrl) throw new Error('Select an ArcGIS REST layer.')

  const geojson = await fetchArcGisFeatureLayerGeoJson(layerUrl, {
    token: input.token?.trim() || undefined,
    returnGeometry: true,
  })
  if (!geojson.features.length) throw new Error('The selected layer has no features with geometry.')

  const row = persistArcGisHostedFeatureLayerToGisContentPortal({
    title: input.title?.trim() || 'ArcGIS layer',
    geojson: geojson as GisHostedFeatureLayerGeoJson,
    serviceUrl: layerUrl,
    registerOnMap: true,
  })
  return { row, message: `Added "${row.title}" from ArcGIS REST.`, geojson: geojson as GeoJSON.FeatureCollection }
}

export function ingestAcpWmsLayer(input: {
  serviceUrl: string
  layerName: string
  title?: string
}): AcpIngestLayerResult {
  const serviceUrl = input.serviceUrl.trim()
  const layerName = input.layerName.trim()
  if (!serviceUrl) throw new Error('Enter a WMS service URL.')
  if (!layerName) throw new Error('Enter a WMS layer name.')

  const meta = buildAcpOgcLayerMetadata({
    dataFormat: 'wms',
    serviceUrl,
    layerName,
    style: '',
    tileMatrixSet: 'EPSG:3857',
    imageFormat: 'image/png',
  })

  const row = upsertGisContentPortalItem({
    title: input.title?.trim() || layerName,
    type: 'file',
    typeLabel: 'WMS layer',
    details: {
      dataFormat: 'wms',
      portalSource: { kind: 'wms', externalUrl: serviceUrl },
      metadata: meta,
      tags: ['WMS', 'OGC', 'Elite AgroCloud'],
    },
  })
  return registerAndReturn(row, `WMS layer "${row.title}" is now on the map.`)
}

export function ingestAcpWmtsLayer(input: {
  serviceUrl: string
  layerName: string
  tileMatrixSet?: string
  title?: string
}): AcpIngestLayerResult {
  const serviceUrl = input.serviceUrl.trim()
  const layerName = input.layerName.trim()
  if (!serviceUrl) throw new Error('Enter a WMTS service URL.')
  if (!layerName) throw new Error('Enter a WMTS layer identifier.')

  const meta = buildAcpOgcLayerMetadata({
    dataFormat: 'wmts',
    serviceUrl,
    layerName,
    style: 'default',
    tileMatrixSet: input.tileMatrixSet?.trim() || 'EPSG:3857',
    imageFormat: 'image/png',
  })

  const row = upsertGisContentPortalItem({
    title: input.title?.trim() || layerName,
    type: 'file',
    typeLabel: 'WMTS layer',
    details: {
      dataFormat: 'wmts',
      portalSource: { kind: 'wmts', externalUrl: serviceUrl },
      metadata: meta,
      tags: ['WMTS', 'OGC', 'Elite AgroCloud'],
    },
  })
  return registerAndReturn(row, `WMTS layer "${row.title}" is now on the map.`)
}

export async function ingestAcpLayerFromGisContent(row: GisContentRow): Promise<AcpIngestLayerResult> {
  const details = getGisContentItemDetails(row.id)
  if (details?.dataFormat === 'wms' || details?.dataFormat === 'wmts') {
    registerGisContentMapLayer(row.id)
    return { row, message: `Added "${row.title}" (${details.dataFormat.toUpperCase()}).` }
  }
  const result = await addAcpGisPortalRowToMap(row)
  return {
    row,
    message: result.message,
    geojson: result.geojson,
    isAgroStructures: result.isAgroStructures,
  }
}
