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

/** Boost marker size when zoomed out so portfolio / continental view still shows points. */
export function developEliteMapPointZoomScale(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1
  if (zoom >= 15) return 1
  if (zoom >= 11) return 0.88 + (zoom - 11) * 0.03
  if (zoom >= 8) return 0.78 + (zoom - 8) * 0.033
  if (zoom >= 4) return 0.72 + (zoom - 4) * 0.015
  return Math.max(0.82, 0.62 + zoom * 0.05)
}

/** AgroLocation PMS symbols — stay readable on the grid map canvas when zoomed out. */
export function developEliteAgriLocationPointZoomScale(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1
  if (zoom >= 14) return 1
  if (zoom >= 10) return 0.92 + (zoom - 10) * 0.02
  if (zoom >= 6) return 0.84 + (zoom - 6) * 0.02
  return Math.max(0.88, 0.68 + zoom * 0.05)
}

/** Line / outline weight multiplier so vector overlays stay visible at low zoom. */
export function developEliteMapLineWidthZoomScale(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1
  if (zoom >= 12) return 1
  if (zoom >= 8) return 1 + (12 - zoom) * 0.14
  if (zoom >= 4) return 1.56 + (8 - zoom) * 0.18
  return Math.max(2.4, 2.9 - zoom * 0.12)
}
