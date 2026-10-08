import type { Map as MaplibreMap } from 'maplibre-gl'
import { bbox } from '@turf/turf'
import type { DevelopEliteMapView } from './developEliteKpiEngine'
import {
  DEVELOP_ELITE_MAP_DEFAULT_VIEW,
  DEVELOP_ELITE_PORTFOLIO_FIT_PADDING,
  DEVELOP_ELITE_PORTFOLIO_MAX_ZOOM,
  resolveDevelopElitePortfolioBounds,
} from './developEliteMapViewport'
import {
  applyMapLibreGlobeGalaxySky,
  setMapLibreGlobeProjection,
} from '@/modules/gis/map/maplibreGlobeEnvironment'
import { findFeatureIndexByStableKey } from '@/modules/gis/layers/gisFeatureStableKey'
import {
  developEliteMapLibreCinematicFlyToBbox,
  developEliteMapLibreCinematicFlyToLngLat,
  developEliteMapLibreCinematicFlyToPortfolioHome,
  type DevelopEliteMapLibreCinematicFlyOpts,
} from './developEliteMapLibreCinematicFly'

function geoJsonBbox(
  geojson: GeoJSON.FeatureCollection,
): [number, number, number, number] | null {
  if (!geojson.features.length) return null
  try {
    const [west, south, east, north] = bbox(geojson)
    if (!Number.isFinite(west)) return null
    return [west, south, east, north]
  } catch {
    return null
  }
}

export function developEliteMapLibreFitBbox(
  map: MaplibreMap,
  box: [number, number, number, number],
  options?: { padding?: number; maxZoom?: number; duration?: number },
): void {
  map.fitBounds(
    [
      [box[0], box[1]],
      [box[2], box[3]],
    ],
    {
      padding: options?.padding ?? 48,
      maxZoom: options?.maxZoom ?? 14,
      duration: options?.duration ?? 800,
    },
  )
}

export function developEliteMapLibreFitPortfolio(
  map: MaplibreMap,
  worldCountries?: GeoJSON.FeatureCollection | null,
  options?: { animate?: boolean },
): void {
  const bounds = resolveDevelopElitePortfolioBounds(worldCountries as never)
  const sw = bounds.getSouthWest()
  const ne = bounds.getNorthEast()
  developEliteMapLibreFitBbox(
    map,
    [sw.lng, sw.lat, ne.lng, ne.lat],
    {
      padding: DEVELOP_ELITE_PORTFOLIO_FIT_PADDING[0],
      maxZoom: DEVELOP_ELITE_PORTFOLIO_MAX_ZOOM,
      duration: options?.animate ? 850 : 0,
    },
  )
}

export function developEliteMapLibreFlyToFieldKey(
  map: MaplibreMap,
  geojson: GeoJSON.FeatureCollection,
  fieldKey: string,
  flyOpts?: DevelopEliteMapLibreCinematicFlyOpts,
): boolean {
  const idx = findFeatureIndexByStableKey(geojson.features, fieldKey)
  const hit = idx >= 0 ? geojson.features[idx] : undefined
  if (!hit?.geometry) return false
  const box = bbox({ type: 'Feature', geometry: hit.geometry, properties: {} })
  return developEliteMapLibreCinematicFlyToBbox(map, box as [number, number, number, number], {
    maxZoom: 16,
    padding: 56,
    viewMode3d: flyOpts?.viewMode3d,
  })
}

export function developEliteMapLibreFlyToLatLng(
  map: MaplibreMap,
  lat: number,
  lng: number,
  zoom = 14,
  flyOpts?: DevelopEliteMapLibreCinematicFlyOpts,
): void {
  developEliteMapLibreCinematicFlyToLngLat(map, lng, lat, zoom, {
    viewMode3d: flyOpts?.viewMode3d,
    floorZoomToCurrent: true,
  })
}

export function developEliteMapLibreReadView(map: MaplibreMap): DevelopEliteMapView {
  const b = map.getBounds()
  return {
    zoom: map.getZoom(),
    west: b.getWest(),
    south: b.getSouth(),
    east: b.getEast(),
    north: b.getNorth(),
  }
}

/** Portfolio home on load / Home tool: globe + galaxy, camera not tilted (pitch 0). */
export function applyDevelopEliteMapLibreFlatPortfolioCamera(
  map: MaplibreMap,
  options?: { animate?: boolean },
): void {
  const view = DEVELOP_ELITE_MAP_DEFAULT_VIEW
  setMapLibreGlobeProjection(map)
  map.easeTo({
    center: [view.center[1], view.center[0]],
    zoom: view.zoom,
    pitch: 0,
    bearing: 0,
    duration: options?.animate ? 600 : 0,
  })
  applyMapLibreGlobeGalaxySky(map)
}

/** Canonical portfolio map view (fixed zoom — not fitBounds-derived). */
export function developEliteMapLibreApplyDefaultPortfolioView(
  map: MaplibreMap,
  options?: { animate?: boolean; preserveOrientation?: boolean; cinematic?: boolean },
): void {
  if (!options?.cinematic && !options?.preserveOrientation) {
    applyDevelopEliteMapLibreFlatPortfolioCamera(map, { animate: options?.animate })
    return
  }
  const view = DEVELOP_ELITE_MAP_DEFAULT_VIEW
  if (options?.cinematic && options?.animate !== false) {
    developEliteMapLibreCinematicFlyToPortfolioHome(map)
    return
  }
  setMapLibreGlobeProjection(map)
  map.flyTo({
    center: [view.center[1], view.center[0]],
    zoom: view.zoom,
    pitch: options?.preserveOrientation ? map.getPitch() : view.pitch,
    bearing: options?.preserveOrientation ? map.getBearing() : view.bearing,
    duration: options?.animate ? 600 : 0,
  })
  applyMapLibreGlobeGalaxySky(map)
}

export function developEliteMapLibreResetView(map: MaplibreMap): void {
  developEliteMapLibreApplyDefaultPortfolioView(map, { animate: true })
}

export function developEliteMapLibreFitGeoJson(
  map: MaplibreMap,
  geojson: GeoJSON.FeatureCollection,
  options?: { maxZoom?: number },
): boolean {
  const box = geoJsonBbox(geojson)
  if (!box) return false
  developEliteMapLibreFitBbox(map, box, { maxZoom: options?.maxZoom ?? 14 })
  return true
}

export function developEliteMapLibreFlyToGeoJsonFeatureIndex(
  map: MaplibreMap,
  geojson: GeoJSON.FeatureCollection,
  featureIndex: number,
  flyOpts?: DevelopEliteMapLibreCinematicFlyOpts,
): boolean {
  const hit = geojson.features[featureIndex]
  if (!hit?.geometry) return false
  const box = bbox({ type: 'Feature', geometry: hit.geometry, properties: {} })
  const isPoint =
    hit.geometry.type === 'Point' ||
    (hit.geometry.type === 'MultiPoint' && hit.geometry.coordinates.length === 1)
  return developEliteMapLibreCinematicFlyToBbox(map, box as [number, number, number, number], {
    maxZoom: 16,
    padding: isPoint ? 72 : 56,
    viewMode3d: flyOpts?.viewMode3d,
  })
}
