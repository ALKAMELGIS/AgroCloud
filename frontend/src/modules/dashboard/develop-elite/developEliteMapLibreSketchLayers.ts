import type { GeoJSONSource, Map as MaplibreMap } from 'maplibre-gl'
import {
  developEliteMapLibreHasLayer,
  developEliteMapLibreRunIfStyleReady,
  isDevelopEliteMapLibreStyleReady,
} from './developEliteMapLibreStyle'

const SRC_SKETCH = 'de-draw-sketch'
const SRC_PREVIEW = 'de-draw-sketch-preview'
const LAYER_SKETCH_FILL = 'de-draw-sketch-fill'
const LAYER_SKETCH_LINE = 'de-draw-sketch-line'
const LAYER_SKETCH_POINT = 'de-draw-sketch-point'
const LAYER_PREVIEW_FILL = 'de-draw-sketch-preview-fill'
const LAYER_PREVIEW_LINE = 'de-draw-sketch-preview-line'

const ACCENT = '#4ade80'

const POINT_FILTER = ['in', ['geometry-type'], ['literal', ['Point', 'MultiPoint']]]
const POLY_FILTER = ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]]
const LINE_FILTER = [
  'in',
  ['geometry-type'],
  ['literal', ['LineString', 'MultiLineString', 'Polygon', 'MultiPolygon']],
]

function emptyFc(): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: [] }
}

function ensureSource(map: MaplibreMap, id: string, data: GeoJSON.FeatureCollection) {
  const existing = map.getSource(id) as GeoJSONSource | undefined
  if (existing?.setData) {
    existing.setData(data)
    return
  }
  if (map.getSource(id)) map.removeSource(id)
  map.addSource(id, { type: 'geojson', data })
}

function ensureLayer(
  map: MaplibreMap,
  spec: {
    id: string
    type: 'fill' | 'line' | 'circle'
    source: string
    filter?: unknown[]
    paint: Record<string, unknown>
  },
) {
  if (developEliteMapLibreHasLayer(map, spec.id)) {
    Object.entries(spec.paint).forEach(([k, v]) => map.setPaintProperty(spec.id, k, v))
    return
  }
  map.addLayer({
    id: spec.id,
    type: spec.type,
    source: spec.source,
    filter: spec.filter as Parameters<MaplibreMap['setFilter']>[1],
    paint: spec.paint,
  })
}

export function ensureDevelopEliteMapLibreSketchLayers(map: MaplibreMap): void {
  if (!isDevelopEliteMapLibreStyleReady(map)) return

  ensureSource(map, SRC_SKETCH, emptyFc())
  ensureSource(map, SRC_PREVIEW, emptyFc())

  ensureLayer(map, {
    id: LAYER_SKETCH_FILL,
    type: 'fill',
    source: SRC_SKETCH,
    filter: POLY_FILTER,
    paint: { 'fill-color': ACCENT, 'fill-opacity': 0.2 },
  })
  ensureLayer(map, {
    id: LAYER_SKETCH_LINE,
    type: 'line',
    source: SRC_SKETCH,
    filter: LINE_FILTER,
    paint: { 'line-color': ACCENT, 'line-width': 3, 'line-opacity': 0.85 },
  })
  ensureLayer(map, {
    id: LAYER_SKETCH_POINT,
    type: 'circle',
    source: SRC_SKETCH,
    filter: POINT_FILTER,
    paint: {
      'circle-radius': 6,
      'circle-color': ACCENT,
      'circle-stroke-color': '#ecfdf3',
      'circle-stroke-width': 2,
      'circle-opacity': 0.9,
    },
  })

  ensureLayer(map, {
    id: LAYER_PREVIEW_FILL,
    type: 'fill',
    source: SRC_PREVIEW,
    filter: POLY_FILTER,
    paint: { 'fill-color': ACCENT, 'fill-opacity': 0.12 },
  })
  ensureLayer(map, {
    id: LAYER_PREVIEW_LINE,
    type: 'line',
    source: SRC_PREVIEW,
    filter: LINE_FILTER,
    paint: { 'line-color': ACCENT, 'line-width': 2, 'line-opacity': 0.65, 'line-dasharray': [2, 2] },
  })
}

export function syncDevelopEliteMapLibreSketchData(
  map: MaplibreMap,
  committed: GeoJSON.FeatureCollection,
  preview: GeoJSON.FeatureCollection,
): void {
  developEliteMapLibreRunIfStyleReady(map, map => {
    ensureDevelopEliteMapLibreSketchLayers(map)
    ensureSource(map, SRC_SKETCH, committed)
    ensureSource(map, SRC_PREVIEW, preview)
  })
}

export function raiseDevelopEliteMapLibreSketchLayers(map: MaplibreMap): void {
  if (!isDevelopEliteMapLibreStyleReady(map)) return
  const ids = [
    LAYER_SKETCH_FILL,
    LAYER_SKETCH_LINE,
    LAYER_SKETCH_POINT,
    LAYER_PREVIEW_FILL,
    LAYER_PREVIEW_LINE,
  ]
  for (const id of ids) {
    if (!developEliteMapLibreHasLayer(map, id)) continue
    try {
      map.moveLayer(id)
    } catch {
      /* style race */
    }
  }
}
