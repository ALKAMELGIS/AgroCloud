import { geometryBBox } from '../../../../lib/geoAiGeoJsonSpatial'

/** Fixed pixel gap between co-located CHAS and Weather alert markers at the same field. */
export const ACP_CO_MARKER_GAP_X = 52
export const ACP_CO_MARKER_GAP_Y = 48

export type AcpCoMarkerRole = 'chas' | 'weather'

export type AcpMapMarkerAnchor =
  | 'center'
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'

export type AcpWeatherMarkerPlacement = {
  lngLat: [number, number]
  anchor: AcpMapMarkerAnchor
}

/**
 * Pixel offset from field centroid (MapLibre Marker `offset`, anchor: center).
 * When both layers are active at the same field, CHAS stays near centroid.
 */
export function resolveAcpCoMarkerPixelOffset(
  role: AcpCoMarkerRole,
  hasCoMarker: boolean,
): [number, number] {
  if (!hasCoMarker || role === 'weather') return [0, 0]
  return [-Math.round(ACP_CO_MARKER_GAP_X * 0.55), Math.round(ACP_CO_MARKER_GAP_Y * 0.35)]
}

/** Field keys where CHAS + Weather markers share the same centroid. */
export function buildAcpCoLocatedMarkerFieldKeys(
  chasFieldKeys: Iterable<string>,
  weatherFieldKeys: Iterable<string>,
): Set<string> {
  const weather = new Set(weatherFieldKeys)
  const shared = new Set<string>()
  for (const key of chasFieldKeys) {
    if (weather.has(key)) shared.add(key)
  }
  return shared
}

/** Place weather readout on the NE field edge — away from CHAS at centroid. */
export function resolveAcpWeatherFieldEdgePlacement(
  geometry: GeoJSON.Geometry | null | undefined,
  centroid: [number, number],
): AcpWeatherMarkerPlacement {
  const bb = geometryBBox(geometry)
  if (!bb) {
    return { lngLat: centroid, anchor: 'bottom-left' }
  }

  const [west, south, east, north] = bb
  const width = Math.max(east - west, 1e-9)
  const height = Math.max(north - south, 1e-9)
  const inset = 0.08

  return {
    lngLat: [east - width * inset, north - height * inset],
    anchor: 'bottom-left',
  }
}
