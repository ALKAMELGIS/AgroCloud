/**
 * Google Earth-style camera flight for Mapbox / MapLibre globe maps.
 *
 * Mapbox `flyTo({ duration })` is a short linear hop. Omitting duration and
 * driving `curve` + `speed` + `minZoom` uses van Wijk's path: the camera lifts
 * toward space, cruises across the globe, then descends into the landmark.
 */

export type GoogleEarthFlyMap = {
  getCenter?: () => { lng: number; lat: number }
  getZoom?: () => number
  getPitch?: () => number
  getBearing?: () => number
  stop?: () => void
  flyTo?: (opts: Record<string, unknown>) => void
}

export type GoogleEarthFlyTarget = {
  lng: number
  lat: number
  zoom: number
  /** Oblique landing like Google Earth (ignored for country-scale zooms). */
  preferTilt?: boolean
  pitch?: number
  bearing?: number
}

export type GoogleEarthFlyToOptions = {
  center: [number, number]
  zoom: number
  essential: true
  curve: number
  speed: number
  minZoom: number
  maxDuration: number
  easing: (t: number) => number
  pitch?: number
  bearing?: number
}

const R_KM = 6371

export function haversineKm(from: [number, number], to: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(to[1] - from[1])
  const dLng = toRad(to[0] - from[0])
  const lat1 = toRad(from[1])
  const lat2 = toRad(to[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Peak (most zoomed-out) altitude during the cruise, before clamping to current/target zoom. */
export function googleEarthCruiseMinZoom(distanceKm: number): number {
  if (distanceKm < 20) return 12
  if (distanceKm < 80) return 8.5
  if (distanceKm < 250) return 6.2
  if (distanceKm < 800) return 4.1
  if (distanceKm < 2500) return 2.5
  return 1.15
}

export function googleEarthFlySpeed(distanceKm: number): number {
  if (distanceKm < 50) return 0.82
  if (distanceKm < 400) return 0.62
  if (distanceKm < 2000) return 0.48
  return 0.4
}

export function googleEarthFlyCurve(distanceKm: number): number {
  if (distanceKm < 50) return 1.45
  if (distanceKm < 400) return 1.72
  return 1.88
}

/** Ease-in-out cubic — slow lift, long cruise, soft landing. */
export function googleEarthFlyEasing(t: number): number {
  const x = Math.max(0, Math.min(1, t))
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2
}

export function googleEarthArrivalPitch(targetZoom: number, preferTilt: boolean, currentPitch = 0): number {
  if (!preferTilt) return currentPitch
  if (targetZoom < 6) return 0
  if (targetZoom < 10) return Math.max(currentPitch, 28)
  return Math.max(currentPitch, 52)
}

/** Approximate Mapbox zoom that frames a WGS84 bbox (west, south, east, north). */
export function zoomFromLngLatBbox(bbox: [number, number, number, number]): number {
  const span = Math.max(Math.abs(bbox[2] - bbox[0]), Math.abs(bbox[3] - bbox[1]))
  if (span >= 40) return 4
  if (span >= 15) return 5.5
  if (span >= 5) return 7
  if (span >= 1.5) return 9
  if (span >= 0.4) return 11
  if (span >= 0.08) return 13
  if (span >= 0.02) return 15
  return 16.5
}

export function buildGoogleEarthFlyToOptions(
  map: GoogleEarthFlyMap | null | undefined,
  target: GoogleEarthFlyTarget,
): GoogleEarthFlyToOptions {
  const center = map?.getCenter?.()
  const from: [number, number] =
    center && Number.isFinite(center.lng) && Number.isFinite(center.lat)
      ? [center.lng, center.lat]
      : [target.lng, target.lat]
  const currentZoom = typeof map?.getZoom === 'function' && Number.isFinite(map.getZoom()) ? map.getZoom()! : target.zoom
  const currentPitch =
    typeof map?.getPitch === 'function' && Number.isFinite(map.getPitch()) ? map.getPitch()! : 0
  const currentBearing =
    typeof map?.getBearing === 'function' && Number.isFinite(map.getBearing()) ? map.getBearing()! : 0

  const km = haversineKm(from, [target.lng, target.lat])
  const zoom = Number.isFinite(target.zoom) ? target.zoom : 12
  const cruise = googleEarthCruiseMinZoom(km)
  const minZoom = Math.min(cruise, currentZoom, zoom)

  const opts: GoogleEarthFlyToOptions = {
    center: [target.lng, target.lat],
    zoom,
    essential: true,
    curve: googleEarthFlyCurve(km),
    speed: googleEarthFlySpeed(km),
    minZoom,
    maxDuration: km > 2500 ? 11000 : km > 400 ? 8500 : 5200,
    easing: googleEarthFlyEasing,
  }

  const preferTilt = Boolean(target.preferTilt)
  opts.pitch =
    typeof target.pitch === 'number' && Number.isFinite(target.pitch)
      ? target.pitch
      : googleEarthArrivalPitch(zoom, preferTilt, currentPitch)

  if (typeof target.bearing === 'number' && Number.isFinite(target.bearing)) {
    opts.bearing = target.bearing
  } else if (preferTilt && zoom >= 10 && Math.abs(currentBearing) < 6) {
    opts.bearing = 16
  }

  return opts
}

export function flyToLikeGoogleEarth(
  map: GoogleEarthFlyMap | null | undefined,
  target: GoogleEarthFlyTarget,
): boolean {
  if (!map || typeof map.flyTo !== 'function') return false
  if (!Number.isFinite(target.lng) || !Number.isFinite(target.lat)) return false
  const opts = buildGoogleEarthFlyToOptions(map, target)
  try {
    map.stop?.()
    map.flyTo(opts)
    return true
  } catch {
    return false
  }
}
