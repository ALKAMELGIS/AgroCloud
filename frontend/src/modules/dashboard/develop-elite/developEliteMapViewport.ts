import L from 'leaflet'
import { geoJsonBounds } from './developEliteMapFly'

function boundsSpanDegrees(bounds: L.LatLngBounds): number {
  const ne = bounds.getNorthEast()
  const sw = bounds.getSouthWest()
  return Math.max(Math.abs(ne.lat - sw.lat), Math.abs(ne.lng - sw.lng))
}

/** Bump when default globe camera / topographic default changes — clients re-apply {@link DEVELOP_ELITE_MAP_DEFAULT_VIEW}. */
export const DEVELOP_ELITE_MAP_VIEWPORT_PRESET_VERSION = 9
export const DEVELOP_ELITE_MAP_VIEWPORT_PRESET_LS_KEY = 'develop_elite_map_viewport_preset_v'

export type DevelopEliteMapDefaultCamera = {
  /** [latitude, longitude] */
  center: [number, number]
  zoom: number
  pitch: number
  bearing: number
}

/** Camera pitch when 3D Topographic toolbar is on (terrain + extrusion). */
export const DEVELOP_ELITE_MAP_DEFAULT_PORTFOLIO_PITCH = 52

/**
 * Browser-load default: globe on Africa/MENA, galaxy backdrop, country outlines — flat camera
 * (pitch 0). Tilt + topographic only after the user enables 3D Topographic.
 */
export const DEVELOP_ELITE_MAP_DEFAULT_VIEW: DevelopEliteMapDefaultCamera = {
  center: [2.5, 17.5],
  zoom: 1.9,
  pitch: 0,
  bearing: 0,
}

/** `acp-map--3d` / viewport chrome follows the topographic toolbar, not the flat globe home. */
export const DEVELOP_ELITE_MAP_PORTFOLIO_GLOBE_PRESENTATION = false

/** Never enable 3D Topographic on refresh, route entry, or map init — toolbar only. */
export const DEVELOP_ELITE_MAP_DEFAULT_VIEW_3D = false

/** Toolbar, terrain mesh, and GPU extrusion follow explicit 3D Topographic mode only. */
export function isDevelopEliteMapPortfolio3dActive(viewMode3d: boolean): boolean {
  return viewMode3d
}

/** @deprecated Use {@link DEVELOP_ELITE_MAP_DEFAULT_VIEW}. */
export const DEVELOP_ELITE_MAP_DEFAULT_CENTER: [number, number] = DEVELOP_ELITE_MAP_DEFAULT_VIEW.center
/** @deprecated Use {@link DEVELOP_ELITE_MAP_DEFAULT_VIEW}. */
export const DEVELOP_ELITE_MAP_DEFAULT_ZOOM = DEVELOP_ELITE_MAP_DEFAULT_VIEW.zoom

/** Allow slight zoom-out past the default globe view. */
export const DEVELOP_ELITE_MAP_MIN_ZOOM = 0.5

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
