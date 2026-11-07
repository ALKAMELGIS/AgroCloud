import L from 'leaflet'
import type { Map as LeafletMap } from 'leaflet'
import {
  DEVELOP_ELITE_MAP_DATA_PANE,
  DEVELOP_ELITE_MAP_WORLD_COUNTRIES_PANE,
  ensureDevelopEliteMapDataPane,
  ensureDevelopEliteMapWorldCountriesPane,
} from './developEliteMapPanes'

/** SVG paths on the data pane (required when custom panes are used). */
export function createDevelopEliteMapDataSvgRenderer(map: LeafletMap): L.SVG {
  ensureDevelopEliteMapDataPane(map)
  return L.svg({ pane: DEVELOP_ELITE_MAP_DATA_PANE, padding: 0.5 })
}

export function createDevelopEliteMapWorldCountriesSvgRenderer(map: LeafletMap): L.SVG {
  ensureDevelopEliteMapWorldCountriesPane(map)
  return L.svg({ pane: DEVELOP_ELITE_MAP_WORLD_COUNTRIES_PANE, padding: 0.5 })
}
