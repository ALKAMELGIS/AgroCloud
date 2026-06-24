import type { GisContentDataFormat } from './gisContentRepository'
import type { GisContentItemDetails } from './gisContentPortalStore'
import type { GisContentRow } from '../pages/master/gisContentPortalData'
import { getGisContentItemDetails } from './gisContentPortalStore'

export type AcpOgcLayerMeta = {
  dataFormat: 'wms' | 'wmts'
  serviceUrl: string
  layerName: string
  style: string
  tileMatrixSet: string
  imageFormat: string
}

const OGC_FORMATS = new Set<GisContentDataFormat>(['wms', 'wmts'])

export function isAcpOgcRasterDataFormat(format: GisContentDataFormat | undefined): format is 'wms' | 'wmts' {
  return format === 'wms' || format === 'wmts'
}

export function isAcpOgcRasterPortalRow(row: GisContentRow): boolean {
  const details = getGisContentItemDetails(row.id)
  return isAcpOgcRasterDataFormat(details?.dataFormat)
}

export function readAcpOgcLayerMeta(details: GisContentItemDetails | undefined): AcpOgcLayerMeta | null {
  if (!isAcpOgcRasterDataFormat(details?.dataFormat)) return null
  const meta = details.metadata ?? {}
  const serviceUrl = (meta.ogcServiceUrl || details.portalSource?.externalUrl || '').trim()
  const layerName = (meta.ogcLayerName || meta.layerName || '').trim()
  if (!serviceUrl || !layerName) return null
  return {
    dataFormat: details.dataFormat,
    serviceUrl,
    layerName,
    style: meta.ogcStyle?.trim() || '',
    tileMatrixSet: meta.ogcTileMatrixSet?.trim() || 'EPSG:3857',
    imageFormat: meta.ogcImageFormat?.trim() || 'image/png',
  }
}

export function readAcpOgcLayerMetaForRow(row: GisContentRow): AcpOgcLayerMeta | null {
  return readAcpOgcLayerMeta(getGisContentItemDetails(row.id))
}

export function buildAcpOgcLayerMetadata(meta: AcpOgcLayerMeta): Record<string, string> {
  return {
    ogcServiceUrl: meta.serviceUrl,
    ogcLayerName: meta.layerName,
    ogcStyle: meta.style,
    ogcTileMatrixSet: meta.tileMatrixSet,
    ogcImageFormat: meta.imageFormat,
  }
}
