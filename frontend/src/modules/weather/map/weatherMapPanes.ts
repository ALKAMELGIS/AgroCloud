import type { Map as LeafletMap } from 'leaflet'

export const WEATHER_TILE_PANE = 'weatherTilePane'
export const WEATHER_FIELD_PANE = 'weatherFieldPane'
export const WEATHER_EFFECTS_PANE = 'weatherEffectsPane'

export function ensureWeatherMapPanes(map: LeafletMap): void {
  if (!map.getPane(WEATHER_TILE_PANE)) {
    map.createPane(WEATHER_TILE_PANE)
    const pane = map.getPane(WEATHER_TILE_PANE)
    if (pane) pane.style.zIndex = '350'
  }
  if (!map.getPane(WEATHER_FIELD_PANE)) {
    map.createPane(WEATHER_FIELD_PANE)
    const pane = map.getPane(WEATHER_FIELD_PANE)
    if (pane) {
      pane.style.zIndex = '480'
      pane.style.pointerEvents = 'none'
    }
  }
  if (!map.getPane(WEATHER_EFFECTS_PANE)) {
    map.createPane(WEATHER_EFFECTS_PANE)
    const pane = map.getPane(WEATHER_EFFECTS_PANE)
    if (pane) pane.style.zIndex = '330'
  }
}

export function weatherFieldPane(map: LeafletMap): HTMLElement {
  ensureWeatherMapPanes(map)
  return map.getPane(WEATHER_FIELD_PANE) ?? map.getPanes().overlayPane
}

export function weatherEffectsPane(map: LeafletMap): HTMLElement {
  ensureWeatherMapPanes(map)
  return map.getPane(WEATHER_EFFECTS_PANE) ?? map.getPanes().overlayPane
}
