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
  pixelOffset: [number, number]
}

/** CHAS / crop-alert markers stay at the field centroid — never shifted for weather. */
export function resolveAcpCoMarkerPixelOffset(
  _role: AcpCoMarkerRole,
  _hasCoMarker = false,
): [number, number] {
  return [0, 0]
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

/** Place weather readout outside the NE field edge — independent from alert icons. */
export function resolveAcpWeatherFieldEdgePlacement(
  geometry: GeoJSON.Geometry | null | undefined,
  centroid: [number, number],
): AcpWeatherMarkerPlacement {
  const bb = geometryBBox(geometry)
  if (!bb) {
    return { lngLat: centroid, anchor: 'bottom-left', pixelOffset: [10, -10] }
  }

  const [west, south, east, north] = bb
  const width = Math.max(east - west, 1e-9)
  const height = Math.max(north - south, 1e-9)
  const outward = 0.035

  return {
    lngLat: [east + width * outward, north + height * outward],
    anchor: 'bottom-left',
    pixelOffset: [6, -6],
  }
}
