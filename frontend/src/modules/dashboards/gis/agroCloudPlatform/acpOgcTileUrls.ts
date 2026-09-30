import type { AcpOgcLayerMeta } from './acpOgcLayerMeta'

function stripQuery(url: string): string {
  return url.trim().replace(/\?.*$/, '').replace(/\/+$/, '')
}

/** EPSG:3857 WMS 1.3.0 tile template for MapLibre raster sources. */
export function buildWmsTileUrlTemplate(meta: AcpOgcLayerMeta): string {
  const base = stripQuery(meta.serviceUrl)
  const params = new URLSearchParams({
    service: 'WMS',
    version: '1.3.0',
    request: 'GetMap',
    layers: meta.layerName,
    styles: meta.style || '',
    format: meta.imageFormat || 'image/png',
    transparent: 'true',
    crs: 'EPSG:3857',
    bbox: '{bbox-epsg-3857}',
    width: '256',
    height: '256',
  })
  return `${base}?${params.toString()}`
}

/** WMTS KVP GetTile template (EPSG:3857 / GoogleMapsCompatible). */
export function buildWmtsTileUrlTemplate(meta: AcpOgcLayerMeta): string {
  const base = stripQuery(meta.serviceUrl)
  const params = new URLSearchParams({
    service: 'WMTS',
    version: '1.0.0',
    request: 'GetTile',
    layer: meta.layerName,
    style: meta.style || 'default',
    format: meta.imageFormat || 'image/png',
    tilematrixset: meta.tileMatrixSet || 'EPSG:3857',
    tilematrix: '{z}',
    tilerow: '{y}',
    tilecol: '{x}',
  })
  return `${base}?${params.toString()}`
}

export function buildOgcRasterTileUrlTemplate(meta: AcpOgcLayerMeta): string {
  return meta.dataFormat === 'wmts' ? buildWmtsTileUrlTemplate(meta) : buildWmsTileUrlTemplate(meta)
}
