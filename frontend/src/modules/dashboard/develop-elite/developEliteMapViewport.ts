import L from 'leaflet'
import { geoJsonBounds } from './developEliteMapFly'

function boundsSpanDegrees(bounds: L.LatLngBounds): number {
  const ne = bounds.getNorthEast()
  const sw = bounds.getSouthWest()
  return Math.max(Math.abs(ne.lat - sw.lat), Math.abs(ne.lng - sw.lng))
}

/** Default continental view — Europe, Africa, Middle East (matches Elite dashboard). */
export const DEVELOP_ELITE_MAP_DEFAULT_CENTER: [number, number] = [18, 32]
export const DEVELOP_ELITE_MAP_DEFAULT_ZOOM = 3

/** Cap auto-fit so the map stays at portfolio / regional scale, not farm-level. */
export const DEVELOP_ELITE_PORTFOLIO_MAX_ZOOM = 4

/** Phone map width: stay at continental portfolio scale (see default zoom 3). */
export const DEVELOP_ELITE_PORTFOLIO_MAX_ZOOM_PHONE = 3

export const DEVELOP_ELITE_PORTFOLIO_FIT_PADDING: [number, number] = [36, 36]

const DEVELOP_ELITE_PORTFOLIO_FIT_PADDING_PHONE: [number, number] = [12, 12]

export function resolveDevelopElitePortfolioFitOptions(map: L.Map): {
  padding: [number, number]
  maxZoom: number
} {
  const w = map.getSize().x
  if (w > 0 && w < 768) {
    return { padding: DEVELOP_ELITE_PORTFOLIO_FIT_PADDING_PHONE, maxZoom: DEVELOP_ELITE_PORTFOLIO_MAX_ZOOM_PHONE }
  }
  return { padding: DEVELOP_ELITE_PORTFOLIO_FIT_PADDING, maxZoom: DEVELOP_ELITE_PORTFOLIO_MAX_ZOOM }
}

/** Approximate Elite portfolio extent when World_Countries geometry is not ready. */
export const DEVELOP_ELITE_PORTFOLIO_FALLBACK_BOUNDS = L.latLngBounds(
  L.latLng(-36, -28),
  L.latLng(54, 68),
)

export function resolveDevelopElitePortfolioBounds(
  worldCountries?: GeoJSON.FeatureCollection | null,
): L.LatLngBounds {
  if (worldCountries?.features?.length) {
    const fromWorld = geoJsonBounds(worldCountries)
    if (fromWorld?.isValid()) return fromWorld
  }
  return DEVELOP_ELITE_PORTFOLIO_FALLBACK_BOUNDS
}

export function fitDevelopEliteCountryView(
  map: L.Map,
  countryGeojson: GeoJSON.FeatureCollection,
  options?: { animate?: boolean },
): boolean {
  const bounds = geoJsonBounds(countryGeojson)
  if (!bounds?.isValid()) return false
  const span = boundsSpanDegrees(bounds)
  let maxZoom = 9
  if (span > 28) maxZoom = 5
  else if (span > 14) maxZoom = 6
  else if (span > 7) maxZoom = 7
  else if (span > 3) maxZoom = 8
  const fitOptions = { padding: [48, 48] as [number, number], maxZoom }
  if (options?.animate) {
    map.flyToBounds(bounds, { ...fitOptions, duration: 0.85 })
  } else {
    map.fitBounds(bounds, fitOptions)
  }
  return true
}

export function fitDevelopElitePortfolioView(
  map: L.Map,
  worldCountries?: GeoJSON.FeatureCollection | null,
  options?: { animate?: boolean },
): void {
  const bounds = resolveDevelopElitePortfolioBounds(worldCountries)
  const fitOptions = resolveDevelopElitePortfolioFitOptions(map)
  if (options?.animate) {
    map.flyToBounds(bounds, { ...fitOptions, duration: 0.85 })
  } else {
    map.fitBounds(bounds, fitOptions)
  }
}
