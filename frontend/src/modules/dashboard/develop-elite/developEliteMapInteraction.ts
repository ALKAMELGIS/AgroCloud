/** Leaflet MapContainer options tuned for Develop Elite dashboard pan/zoom. */
export const DEVELOP_ELITE_MAP_CONTAINER_OPTIONS = {
  inertia: true,
  inertiaDeceleration: 3400,
  inertiaMaxSpeed: 3200,
  zoomAnimation: false,
  fadeAnimation: false,
  markerZoomAnimation: false,
  preferCanvas: false,
  wheelDebounceTime: 8,
  wheelPxPerZoomLevel: 52,
  bounceAtZoomLimits: false,
} as const

export const DEVELOP_ELITE_MAP_ZOOM_SNAP = 0.25
export const DEVELOP_ELITE_MAP_ZOOM_DELTA = 0.25
