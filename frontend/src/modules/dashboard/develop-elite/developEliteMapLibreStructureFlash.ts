import type { GeoJSONSource, Map as MaplibreMap } from 'maplibre-gl'
import { findFeatureIndexByStableKey } from '@/modules/gis/layers/gisFeatureStableKey'
import { DE_MAPLIBRE_POLY_FILTER, DE_MAPLIBRE_POLY_LINE_FILTER } from './developEliteMapLibreArcgisSymbology'
import { developEliteMapLibreHasLayer, isDevelopEliteMapLibreStyleReady } from './developEliteMapLibreStyle'

const SRC_HIGHLIGHT = 'de-agro-structures-highlight'
const LAYER_HIGHLIGHT_FILL = 'de-agro-structures-highlight-fill'
const LAYER_HIGHLIGHT_LINE = 'de-agro-structures-highlight-line'
const LAYER_HIGHLIGHT_EXTRUDE = 'de-agro-structures-highlight-extrude'

export const DE_MAPLIBRE_STRUCTURE_HIGHLIGHT_LAYER_IDS = [
  LAYER_HIGHLIGHT_FILL,
  LAYER_HIGHLIGHT_EXTRUDE,
  LAYER_HIGHLIGHT_LINE,
] as const

const BASE_FILL_OPACITY = 0.38
const BASE_LINE_WIDTH = 4

function emptyFc(): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: [] }
}

function ensureGeoJsonSource(map: MaplibreMap, data: GeoJSON.FeatureCollection) {
  const existing = map.getSource(SRC_HIGHLIGHT) as GeoJSONSource | undefined
  if (existing?.setData) {
    existing.setData(data)
    return
  }
  if (map.getSource(SRC_HIGHLIGHT)) map.removeSource(SRC_HIGHLIGHT)
  map.addSource(SRC_HIGHLIGHT, { type: 'geojson', data })
}

function ensureHighlightLayers(map: MaplibreMap, viewMode3d: boolean) {
  if (!developEliteMapLibreHasLayer(map, LAYER_HIGHLIGHT_FILL)) {
    map.addLayer({
      id: LAYER_HIGHLIGHT_FILL,
      type: 'fill',
      source: SRC_HIGHLIGHT,
      filter: DE_MAPLIBRE_POLY_FILTER,
      paint: {
        'fill-color': '#39ff14',
        'fill-opacity': BASE_FILL_OPACITY,
      },
    })
  }
  if (!developEliteMapLibreHasLayer(map, LAYER_HIGHLIGHT_EXTRUDE)) {
    map.addLayer({
      id: LAYER_HIGHLIGHT_EXTRUDE,
      type: 'fill-extrusion',
      source: SRC_HIGHLIGHT,
      filter: DE_MAPLIBRE_POLY_FILTER,
      paint: {
        'fill-extrusion-color': '#b8ff6a',
        'fill-extrusion-height': 8,
        'fill-extrusion-opacity': 0.92,
      },
    })
  }
  if (!developEliteMapLibreHasLayer(map, LAYER_HIGHLIGHT_LINE)) {
    map.addLayer({
      id: LAYER_HIGHLIGHT_LINE,
      type: 'line',
      source: SRC_HIGHLIGHT,
      filter: DE_MAPLIBRE_POLY_LINE_FILTER,
      paint: {
        'line-color': '#39ff14',
        'line-width': BASE_LINE_WIDTH,
        'line-opacity': 1,
      },
    })
  }
  map.setLayoutProperty(LAYER_HIGHLIGHT_FILL, 'visibility', viewMode3d ? 'none' : 'visible')
  map.setLayoutProperty(LAYER_HIGHLIGHT_EXTRUDE, 'visibility', viewMode3d ? 'visible' : 'none')
  map.setLayoutProperty(LAYER_HIGHLIGHT_LINE, 'visibility', 'visible')
}

export function syncDevelopEliteMapLibreStructureHighlight(
  map: MaplibreMap,
  geojson: GeoJSON.FeatureCollection,
  fieldKey: string | null,
  viewMode3d: boolean,
): void {
  if (!isDevelopEliteMapLibreStyleReady(map)) return
  ensureHighlightLayers(map, viewMode3d)
  if (!fieldKey) {
    ensureGeoJsonSource(map, emptyFc())
    DE_MAPLIBRE_STRUCTURE_HIGHLIGHT_LAYER_IDS.forEach(id => {
      if (developEliteMapLibreHasLayer(map, id)) map.setLayoutProperty(id, 'visibility', 'none')
    })
    return
  }
  const idx = findFeatureIndexByStableKey(geojson.features, fieldKey)
  const hit = idx >= 0 ? geojson.features[idx] : undefined
  const fc =
    hit?.geometry
      ? { type: 'FeatureCollection' as const, features: [hit as GeoJSON.Feature] }
      : emptyFc()
  ensureGeoJsonSource(map, fc)
  ensureHighlightLayers(map, viewMode3d)
  const visible = fc.features.length > 0
  map.setLayoutProperty(LAYER_HIGHLIGHT_FILL, 'visibility', visible && !viewMode3d ? 'visible' : 'none')
  map.setLayoutProperty(LAYER_HIGHLIGHT_EXTRUDE, 'visibility', visible && viewMode3d ? 'visible' : 'none')
  map.setLayoutProperty(LAYER_HIGHLIGHT_LINE, 'visibility', visible ? 'visible' : 'none')
}

let activePulseCancel: (() => void) | null = null

/** Bright pulse on the highlighted structure (restarts on each request). */
export function pulseDevelopEliteMapLibreStructureHighlight(map: MaplibreMap): void {
  if (!isDevelopEliteMapLibreStyleReady(map)) return
  activePulseCancel?.()
  const started = performance.now()
  const durationMs = 1500
  const cycles = 3

  const tick = () => {
    const elapsed = performance.now() - started
    if (elapsed >= durationMs) {
      if (developEliteMapLibreHasLayer(map, LAYER_HIGHLIGHT_FILL)) {
        map.setPaintProperty(LAYER_HIGHLIGHT_FILL, 'fill-opacity', BASE_FILL_OPACITY)
      }
      if (developEliteMapLibreHasLayer(map, LAYER_HIGHLIGHT_LINE)) {
        map.setPaintProperty(LAYER_HIGHLIGHT_LINE, 'line-width', BASE_LINE_WIDTH)
        map.setPaintProperty(LAYER_HIGHLIGHT_LINE, 'line-opacity', 1)
      }
      activePulseCancel = null
      return
    }
    const phase = (elapsed / durationMs) * cycles * Math.PI * 2
    const wave = 0.5 + 0.5 * Math.sin(phase)
    if (developEliteMapLibreHasLayer(map, LAYER_HIGHLIGHT_FILL)) {
      map.setPaintProperty(LAYER_HIGHLIGHT_FILL, 'fill-opacity', BASE_FILL_OPACITY + wave * 0.42)
    }
    if (developEliteMapLibreHasLayer(map, LAYER_HIGHLIGHT_LINE)) {
      map.setPaintProperty(LAYER_HIGHLIGHT_LINE, 'line-width', BASE_LINE_WIDTH + wave * 5)
      map.setPaintProperty(LAYER_HIGHLIGHT_LINE, 'line-opacity', 0.55 + wave * 0.45)
    }
    pulseFrame = requestAnimationFrame(tick)
  }
  let pulseFrame = requestAnimationFrame(tick)
  activePulseCancel = () => {
    cancelAnimationFrame(pulseFrame)
    activePulseCancel = null
  }
}
