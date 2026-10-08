import type { Map as MaplibreMap } from 'maplibre-gl'
import {
  flyToLikeGoogleEarth,
  zoomFromLngLatBbox,
} from '@/modules/gis/map/googleEarthFlyTo'
import {
  applyMapLibreGlobeGalaxySky,
  setMapLibreGlobeProjection,
} from '@/modules/gis/map/maplibreGlobeEnvironment'
import {
  DEVELOP_ELITE_MAP_DEFAULT_PORTFOLIO_PITCH,
  DEVELOP_ELITE_MAP_DEFAULT_VIEW,
} from './developEliteMapViewport'

export type DevelopEliteMapLibreCinematicFlyOpts = {
  viewMode3d?: boolean
  padding?: number
  maxZoom?: number
  /** When true, never zoom out below the current level (point / GPS fly). */
  floorZoomToCurrent?: boolean
}

const CINEMATIC_VIEWPORT_CLASS = 'develop-elite-map__viewport--cinematic-fly'

function resolveCameraCenter(
  center: [number, number] | { lng: number; lat: number } | undefined,
): { lng: number; lat: number } | null {
  if (!center) return null
  if (Array.isArray(center)) {
    const [lng, lat] = center
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
    return { lng, lat }
  }
  if (!Number.isFinite(center.lng) || !Number.isFinite(center.lat)) return null
  return { lng: center.lng, lat: center.lat }
}

function beginCinematicFlyChrome(map: MaplibreMap): void {
  const shell = document.querySelector('.develop-elite-map__viewport')
  shell?.classList.add(CINEMATIC_VIEWPORT_CLASS)
  const end = () => {
    shell?.classList.remove(CINEMATIC_VIEWPORT_CLASS)
    map.off('moveend', end)
  }
  map.once('moveend', end)
}

export function developEliteMapLibreCinematicFlyToLngLat(
  map: MaplibreMap,
  lng: number,
  lat: number,
  zoom: number,
  opts?: DevelopEliteMapLibreCinematicFlyOpts,
): boolean {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return false
  const view3d = Boolean(opts?.viewMode3d)
  const currentZoom = map.getZoom()
  const targetZoom = opts?.floorZoomToCurrent ? Math.max(currentZoom, zoom) : zoom

  beginCinematicFlyChrome(map)
  return flyToLikeGoogleEarth(map, {
    lng,
    lat,
    zoom: targetZoom,
    preferTilt: view3d,
    pitch: view3d ? DEVELOP_ELITE_MAP_DEFAULT_PORTFOLIO_PITCH : 0,
  })
}

export function developEliteMapLibreCinematicFlyToBbox(
  map: MaplibreMap,
  box: [number, number, number, number],
  opts?: DevelopEliteMapLibreCinematicFlyOpts,
): boolean {
  const padding = opts?.padding ?? 56
  const maxZoom = opts?.maxZoom ?? 16
  const view3d = Boolean(opts?.viewMode3d)
  const sw: [number, number] = [box[0], box[1]]
  const ne: [number, number] = [box[2], box[3]]

  let lng = (box[0] + box[2]) / 2
  let lat = (box[1] + box[3]) / 2
  let zoom = zoomFromLngLatBbox(box)

  if (typeof map.cameraForBounds === 'function') {
    try {
      const cam = map.cameraForBounds([sw, ne], { padding, maxZoom })
      const center = cam ? resolveCameraCenter(cam.center) : null
      if (center && typeof cam?.zoom === 'number' && Number.isFinite(cam.zoom)) {
        lng = center.lng
        lat = center.lat
        zoom = Math.min(cam.zoom, maxZoom)
      }
    } catch {
      /* use bbox fallback */
    }
  }

  beginCinematicFlyChrome(map)
  return flyToLikeGoogleEarth(map, {
    lng,
    lat,
    zoom,
    preferTilt: view3d,
    pitch: view3d ? DEVELOP_ELITE_MAP_DEFAULT_PORTFOLIO_PITCH : 0,
  })
}

/** Product home globe — fixed center/zoom/pitch from {@link DEVELOP_ELITE_MAP_DEFAULT_VIEW}. */
export function developEliteMapLibreCinematicFlyToPortfolioHome(map: MaplibreMap): boolean {
  const view = DEVELOP_ELITE_MAP_DEFAULT_VIEW
  setMapLibreGlobeProjection(map)
  beginCinematicFlyChrome(map)
  const ok = flyToLikeGoogleEarth(map, {
    lng: view.center[1],
    lat: view.center[0],
    zoom: view.zoom,
    pitch: view.pitch,
    bearing: view.bearing,
    preferTilt: false,
  })
  applyMapLibreGlobeGalaxySky(map)
  return ok
}
