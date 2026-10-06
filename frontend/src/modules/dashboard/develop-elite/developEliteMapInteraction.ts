/** Leaflet MapContainer options tuned for Develop Elite dashboard pan/zoom. */
export const DEVELOP_ELITE_MAP_CONTAINER_OPTIONS = {
  inertia: true,
  inertiaDeceleration: 3400,
  inertiaMaxSpeed: 3200,
  /** Off during wheel/pinch — CSS transform stays smooth; avoids double tile work. */
  zoomAnimation: false,
  fadeAnimation: false,
  markerZoomAnimation: false,
  preferCanvas: false,
  wheelDebounceTime: 28,
  /** Higher = lighter wheel zoom (more px per zoom step). */
  wheelPxPerZoomLevel: 76,
  bounceAtZoomLimits: false,
} as const

/** Fewer fractional steps → less basemap tile churn while panning/zooming. */
export const DEVELOP_ELITE_MAP_ZOOM_SNAP = 0.5
export const DEVELOP_ELITE_MAP_ZOOM_DELTA = 0.5

/** Basemap TileLayer options (Google / Esri) on the DE grid map. */
export const DEVELOP_ELITE_BASEMAP_TILE_PROPS = {
  updateWhenIdle: true,
  updateWhenZooming: false,
  keepBuffer: 5,
} as const
