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

export function drawnAoiClipSignature(fc: GeoJSON.FeatureCollection | null | undefined): string {
  if (!fc?.features?.length) return ''
  return `drawn:${fc.features.length}:${JSON.stringify(fc.features[0]?.geometry?.type ?? '')}`
}
