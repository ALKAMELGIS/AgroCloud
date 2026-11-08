import type { Map as MaplibreMap } from 'maplibre-gl'

/** Snappier 360° orbit than the shared AgroCloud default (ArcGIS Online–style). */
export const DEVELOP_ELITE_ORBIT_BEARING_SENSITIVITY = 0.54
export const DEVELOP_ELITE_ORBIT_PITCH_SENSITIVITY = 0.48

/** Left-drag orbits (instead of pan) when 3D topographic view is active above this pitch. */
export const DEVELOP_ELITE_ORBIT_PRIMARY_DRAG_MIN_PITCH = 36

export const DEVELOP_ELITE_ORBIT_SENSITIVITY = {
  bearing: DEVELOP_ELITE_ORBIT_BEARING_SENSITIVITY,
  pitch: DEVELOP_ELITE_ORBIT_PITCH_SENSITIVITY,
} as const

export function developEliteMapAllowsPrimaryPointerOrbit(
  map: MaplibreMap | null | undefined,
  viewMode3d: boolean,
): boolean {
  if (!map || !viewMode3d) return false
  try {
    return map.getPitch() >= DEVELOP_ELITE_ORBIT_PRIMARY_DRAG_MIN_PITCH
  } catch {
    return false
  }
}
