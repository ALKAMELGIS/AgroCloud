/** Portfolio default (UAE) — Windy + map framing when catalog is still loading. */
export const WEATHER_MAP_PORTFOLIO_CENTER: [number, number] = [24.45, 54.65]

/** Windy-style world overview (legacy Leaflet idle center before fit-bounds runs). */
export const WEATHER_MAP_WORLD_CENTER: [number, number] = WEATHER_MAP_PORTFOLIO_CENTER

/** Leaflet zoom before fit-bounds (portfolio sites load quickly). */
export const WEATHER_MAP_WORLD_ZOOM = 6

/** Cap auto-fit when portfolio / all locations are shown (avoid jumping to field scale). */
export const WEATHER_MAP_PORTFOLIO_MAX_ZOOM = 7

/** Windy embed zoom for a single farm pin. */
export const WEATHER_WINDY_SITE_ZOOM = 10

/** Windy embed zoom when “All locations” fits the portfolio bounds. */
export const WEATHER_WINDY_PORTFOLIO_MAX_ZOOM = 6

/** Rough Leaflet-style zoom from geographic span (for Windy embed). */
export function estimateMapZoomForBounds(
  west: number,
  south: number,
  east: number,
  north: number,
): number {
  const latSpan = Math.max(0.05, north - south)
  const lngSpan = Math.max(0.05, east - west)
  const span = Math.max(latSpan, lngSpan)
  if (span > 80) return 2
  if (span > 35) return 3
  if (span > 18) return 4
  if (span > 10) return 5
  if (span > 5) return 6
  if (span > 2) return 7
  if (span > 1) return 8
  if (span > 0.4) return 9
  return 10
}
