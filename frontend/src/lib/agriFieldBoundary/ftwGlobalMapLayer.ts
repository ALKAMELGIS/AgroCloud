/**
 * Imperative Mapbox/MapLibre layer for FTW global PMTiles (pre-computed v3 B7).
 */

import mapboxgl from 'mapbox-gl'
import { Protocol } from 'pmtiles'
import {
  FTW_GLOBAL_FIELD_MIN_ZOOM,
  FTW_GLOBAL_FILL_ID,
  FTW_GLOBAL_LINE_ID,
  FTW_GLOBAL_SOURCE_ID,
  ftwThresholdToRaw,
  getFtwGlobalPmtilesUrl,
  getFtwGlobalSourceLayer,
  type FtwGlobalLayerSettings,
} from './ftwGlobalConfig'

let pmtilesProtocolReady = false

type MapboxWithProtocol = typeof mapboxgl & {
  addProtocol: (scheme: string, handler: (...args: unknown[]) => unknown) => void
}

function ensurePmtilesProtocol(): void {
  if (pmtilesProtocolReady) return
  const protocol = new Protocol()
  ;(mapboxgl as MapboxWithProtocol).addProtocol('pmtiles', protocol.tile)
  pmtilesProtocolReady = true
}

type MapboxMap = mapboxgl.Map

function confidenceExpr(): mapboxgl.Expression {
  return ['to-number', ['get', 'confidence_mean']] as mapboxgl.Expression
}

function buildFilter(thresholdPct: number): mapboxgl.Expression {
  return ['>=', confidenceExpr(), ftwThresholdToRaw(thresholdPct)] as mapboxgl.Expression
}

function buildLineColor(): mapboxgl.Expression {
  const t70 = ftwThresholdToRaw(70)
  const t80 = ftwThresholdToRaw(80)
  const t100 = ftwThresholdToRaw(100)
  return [
    'interpolate',
    ['linear'],
    confidenceExpr(),
    0,
    '#d7191c',
    t70,
    '#fec379',
    t80,
    '#cfecb0',
    t100,
    '#33a02c',
  ] as mapboxgl.Expression
}

function layerVisibility(visible: boolean): 'visible' | 'none' {
  return visible ? 'visible' : 'none'
}

let lastUrl = ''

export function syncFtwGlobalMapLayer(map: MapboxMap | null | undefined, settings: FtwGlobalLayerSettings): void {
  if (!map?.addSource) return
  ensurePmtilesProtocol()

  const url = getFtwGlobalPmtilesUrl(settings.year)
  const sourceLayer = getFtwGlobalSourceLayer(settings.year)
  const visibility = layerVisibility(settings.visible)
  const lineOpacity = Math.max(0, Math.min(1, settings.opacityPct / 100))
  const fillOpacity = lineOpacity * 0.45
  const filter = buildFilter(settings.thresholdPct)

  const sourceExists = Boolean(map.getSource(FTW_GLOBAL_SOURCE_ID))

  if (!sourceExists || lastUrl !== url) {
    if (map.getLayer(FTW_GLOBAL_LINE_ID)) map.removeLayer(FTW_GLOBAL_LINE_ID)
    if (map.getLayer(FTW_GLOBAL_FILL_ID)) map.removeLayer(FTW_GLOBAL_FILL_ID)
    if (map.getSource(FTW_GLOBAL_SOURCE_ID)) map.removeSource(FTW_GLOBAL_SOURCE_ID)

    map.addSource(FTW_GLOBAL_SOURCE_ID, {
      type: 'vector',
      url: `pmtiles://${url}`,
    })

    map.addLayer({
      id: FTW_GLOBAL_FILL_ID,
      type: 'fill',
      source: FTW_GLOBAL_SOURCE_ID,
      'source-layer': sourceLayer,
      minzoom: FTW_GLOBAL_FIELD_MIN_ZOOM,
      filter,
      layout: { visibility },
      paint: {
        'fill-color': buildLineColor(),
        'fill-opacity': fillOpacity,
        'fill-outline-color': 'rgba(0,0,0,0)',
      },
    })

    map.addLayer({
      id: FTW_GLOBAL_LINE_ID,
      type: 'line',
      source: FTW_GLOBAL_SOURCE_ID,
      'source-layer': sourceLayer,
      minzoom: FTW_GLOBAL_FIELD_MIN_ZOOM,
      filter,
      layout: {
        visibility,
        'line-join': 'round',
        'line-cap': 'round',
      },
      paint: {
        'line-color': buildLineColor(),
        'line-width': 1.2,
        'line-opacity': lineOpacity,
      },
    })

    lastUrl = url
    return
  }

  for (const layerId of [FTW_GLOBAL_FILL_ID, FTW_GLOBAL_LINE_ID]) {
    if (!map.getLayer(layerId)) continue
    map.setLayoutProperty(layerId, 'visibility', visibility)
    map.setFilter(layerId, filter)
  }

  if (map.getLayer(FTW_GLOBAL_FILL_ID)) {
    map.setPaintProperty(FTW_GLOBAL_FILL_ID, 'fill-color', buildLineColor())
    map.setPaintProperty(FTW_GLOBAL_FILL_ID, 'fill-opacity', fillOpacity)
  }
  if (map.getLayer(FTW_GLOBAL_LINE_ID)) {
    map.setPaintProperty(FTW_GLOBAL_LINE_ID, 'line-color', buildLineColor())
    map.setPaintProperty(FTW_GLOBAL_LINE_ID, 'line-opacity', lineOpacity)
  }

  const currentLayer = map.getLayer(FTW_GLOBAL_LINE_ID) as mapboxgl.LayerSpecification | undefined
  const currentSourceLayer =
    currentLayer && 'source-layer' in currentLayer ? currentLayer['source-layer'] : undefined
  if (currentSourceLayer !== sourceLayer) {
    lastUrl = ''
    syncFtwGlobalMapLayer(map, settings)
  }
}

export function removeFtwGlobalMapLayer(map: MapboxMap | null | undefined): void {
  if (!map?.getSource) return
  if (map.getLayer(FTW_GLOBAL_LINE_ID)) map.removeLayer(FTW_GLOBAL_LINE_ID)
  if (map.getLayer(FTW_GLOBAL_FILL_ID)) map.removeLayer(FTW_GLOBAL_FILL_ID)
  if (map.getSource(FTW_GLOBAL_SOURCE_ID)) map.removeSource(FTW_GLOBAL_SOURCE_ID)
  lastUrl = ''
}
