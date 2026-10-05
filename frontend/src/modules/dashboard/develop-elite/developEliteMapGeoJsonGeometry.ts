export function geoJsonFeatureHasPointGeometry(feature: GeoJSON.Feature): boolean {
  const t = feature.geometry?.type
  return t === 'Point' || t === 'MultiPoint'
}

export function geoJsonFeatureHasVectorGeometry(feature: GeoJSON.Feature): boolean {
  const t = feature.geometry?.type
  return (
    t === 'LineString' ||
    t === 'MultiLineString' ||
    t === 'Polygon' ||
    t === 'MultiPolygon'
  )
}

/** Tree / valves / AgroLocation — avoid SVG renderer on the GeoJSON group (breaks picture markers). */
export function isDevelopElitePointOnlyArcgisGeoJson(features: GeoJSON.Feature[]): boolean {
  if (!features.length) return false
  let hasPoint = false
  for (const f of features) {
    if (geoJsonFeatureHasVectorGeometry(f)) return false
    if (geoJsonFeatureHasPointGeometry(f)) hasPoint = true
  }
  return hasPoint
}

/** Slightly boost marker size when zoomed out so portfolio view still shows points. */
export function developEliteMapPointZoomScale(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1
  if (zoom >= 15) return 1
  if (zoom >= 11) return 0.78 + (zoom - 11) * 0.055
  if (zoom >= 8) return 0.58 + (zoom - 8) * 0.067
  return Math.max(0.48, 0.34 + zoom * 0.04)
}
