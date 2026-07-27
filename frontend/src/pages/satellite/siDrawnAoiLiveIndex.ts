import { getDrawnGeometry } from '../../lib/sentinelHubWmsAoiClip'

/** Normalize sketch / feature / collection for Sentinel WMS AOI clip (dataMask). */
export function normalizeDrawnAoiClipCollection(
  geo: unknown,
): GeoJSON.FeatureCollection | null {
  if (!geo || typeof geo !== 'object') return null
  const raw = geo as { type?: string; features?: unknown[]; geometry?: GeoJSON.Geometry }
  if (raw.type === 'FeatureCollection' && Array.isArray(raw.features) && raw.features.length) {
    return raw as GeoJSON.FeatureCollection
  }
  if (raw.type === 'Feature' && raw.geometry) {
    return { type: 'FeatureCollection', features: [raw as GeoJSON.Feature] }
  }
  const geometry = getDrawnGeometry(geo)
  if (!geometry) return null
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry, properties: {} }],
  }
}

/** Cheap stable fingerprint of AOI rings so WMS clip cache invalidates on redraw. */
function fingerprintCoords(coords: unknown, depth = 0): string {
  if (!Array.isArray(coords) || depth > 4) return ''
  if (coords.length >= 2 && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    return `${Number(coords[0]).toFixed(5)},${Number(coords[1]).toFixed(5)}`
  }
  const first = fingerprintCoords(coords[0], depth + 1)
  const last = coords.length > 1 ? fingerprintCoords(coords[coords.length - 1], depth + 1) : ''
  return `${coords.length}:${first}:${last}`
}

export function drawnAoiClipSignature(fc: GeoJSON.FeatureCollection | null | undefined): string {
  if (!fc?.features?.length) return ''
  const geom = fc.features[0]?.geometry as GeoJSON.Geometry | undefined
  const type = geom?.type ?? ''
  const coords =
    geom && 'coordinates' in geom ? fingerprintCoords((geom as GeoJSON.Polygon).coordinates) : ''
  return `drawn:${fc.features.length}:${type}:${coords}`
}
