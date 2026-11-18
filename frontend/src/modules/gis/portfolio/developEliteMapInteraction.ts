/** Leaflet MapContainer options tuned for Develop Elite dashboard pan/zoom. */
export const DEVELOP_ELITE_MAP_CONTAINER_OPTIONS = {
  inertia: true,
  inertiaDeceleration: 3600,
  inertiaMaxSpeed: 3400,
  /** Off during wheel/pinch — CSS transform stays smooth; avoids double tile work. */
  zoomAnimation: false,
  fadeAnimation: false,
  markerZoomAnimation: false,
  preferCanvas: false,
  /** Debounce wheel so basemap tiles are not re-queued every tick. */
  wheelDebounceTime: 36,
  /** Higher = fewer zoom steps per scroll → less tile churn. */
  wheelPxPerZoomLevel: 84,
  bounceAtZoomLimits: false,
} as const

/** Integer zoom → one tile pyramid level after gesture ends (smooth scale while wheeling). */
export const DEVELOP_ELITE_MAP_ZOOM_SNAP = 1
export const DEVELOP_ELITE_MAP_ZOOM_DELTA = 1

/** Cap hi-res satellite fetches in the dashboard grid map widget. */
export const DEVELOP_ELITE_BASEMAP_MAX_ZOOM = 20

/**
 * Basemap-only TileLayer options on the DE grid map.
 * Overlays use separate panes and are hidden in CSS while interacting.
 */
export const DEVELOP_ELITE_BASEMAP_TILE_PROPS = {
  /** Load while panning so the viewport never drains to an empty (black) tile pane. */
  updateWhenIdle: false,
  /** Keep pyramid tiles visible while zooming (avoids empty #0a1a10 viewport). */
  updateWhenZooming: true,
  keepBuffer: 4,
  className: 'develop-elite-basemap-tile',
  detectRetina: false,
  tileSize: 256,
} as const
