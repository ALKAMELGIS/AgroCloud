import type { Map as LeafletMap } from 'leaflet'

/** Vector data (structures, trees, AgroLocation) — above raster / Layer Live. */
export const DEVELOP_ELITE_MAP_DATA_PANE = 'develop-elite-data-layers'
export const DEVELOP_ELITE_MAP_DATA_PANE_Z_INDEX = 620

/** Country outlines (SVG) — above basemap tiles (200) and raster (300), under markers (600). */
export const DEVELOP_ELITE_MAP_WORLD_COUNTRIES_PANE = 'develop-elite-world-countries'
export const DEVELOP_ELITE_MAP_WORLD_COUNTRIES_PANE_Z_INDEX = 580

/** Sentinel / raster under vector overlays. */
export const DEVELOP_ELITE_MAP_RASTER_PANE_Z_INDEX = 300

export function ensureDevelopEliteMapDataPane(map: LeafletMap): void {
  const name = DEVELOP_ELITE_MAP_DATA_PANE
  if (!map.getPane(name)) map.createPane(name)
  map.getPane(name)!.style.zIndex = String(DEVELOP_ELITE_MAP_DATA_PANE_Z_INDEX)
}

export function ensureDevelopEliteMapWorldCountriesPane(map: LeafletMap): void {
  const name = DEVELOP_ELITE_MAP_WORLD_COUNTRIES_PANE
  if (!map.getPane(name)) map.createPane(name)
  map.getPane(name)!.style.zIndex = String(DEVELOP_ELITE_MAP_WORLD_COUNTRIES_PANE_Z_INDEX)
}
