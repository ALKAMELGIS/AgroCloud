import {
  arcgisDrawingInfoToLinePaint,
  arcgisUniqueValueKeyExpression,
  collectUniqueValueMatchKeys,
  flattenArcgisUniqueValueInfos,
  normalizeUniqueValueKey,
} from '@/modules/gis/layers/arcgisDrawingInfoMapbox'
import {
  layerOpacityFromDrawingInfo,
  resolveArcgisRendererSymbol,
} from '@/modules/gis/layers/arcgisDrawingInfoLeaflet'
import { sanitizeMapboxPaint } from '@/modules/gis/layers/mapboxPaintSanitize'
import type { GeoJSONSource, Map as MaplibreMap } from 'maplibre-gl'
import {
  collectIrrigationMainPipeArrowPlacements,
  irrigationMainPipeArrowSpacingMeters,
  irrigationMainPipeArrowSizePx,
  irrigationMainPipeLineWeight,
  irrigationMainPipePathOptions,
  irrigationMainPipeShowFlowArrows,
} from './developEliteIrrigationMainPipeSymbology'
import { developEliteMapLibreHasLayer, developEliteMapLibreRunIfStyleReady } from './developEliteMapLibreStyle'

const SRC_ARROWS = 'de-irrigation-main-pipe-arrows'
export const LAYER_IRRIGATION_MAIN_PIPE_ARROWS = 'de-irrigation-main-pipe-arrows-symbol'

function esriSlsWidth(symbol: unknown): number {
  const w = (symbol as { width?: number })?.width
  return Number.isFinite(w) ? Number(w) : 14
}

function esriSlsDashArray(symbol: unknown): number[] | undefined {
  const style = String((symbol as { style?: string })?.style ?? '').toLowerCase()
  if (style.includes('dashdot')) return [10, 6, 2, 6]
  if (style.includes('dot')) return [2, 8]
  if (style.includes('dash')) return [10, 8]
  return undefined
}

function pushWidthMatchKeys(widthExpr: any[], value: string, label: string, width: number) {
  const keys = new Set<string>()
  for (const key of collectUniqueValueMatchKeys(value, label)) {
    if (keys.has(key)) continue
    keys.add(key)
    widthExpr.push(key, width)
  }
}

function pushDashMatchKeys(dashExpr: any[], value: string, label: string, dash: number[]) {
  const keys = new Set<string>()
  for (const key of collectUniqueValueMatchKeys(value, label)) {
    if (keys.has(key)) continue
    keys.add(key)
    dashExpr.push(key, dash)
  }
}

function scalePaintOpacity(paint: Record<string, unknown>, factor: number): Record<string, unknown> {
  if (!(factor < 0.999)) return paint
  const next = { ...paint }
  for (const key of Object.keys(next)) {
    if (!key.endsWith('-opacity')) continue
    const v = next[key]
    if (typeof v === 'number' && Number.isFinite(v)) next[key] = v * factor
  }
  return next
}

function buildMainPipeWidthExpression(
  drawingInfo: Record<string, unknown> | null | undefined,
  mapZoom: number,
): number | unknown[] {
  const ren = (drawingInfo as { renderer?: { type?: string } } | null)?.renderer
  if (!ren || ren.type !== 'uniqueValue') {
    const sym = resolveArcgisRendererSymbol(drawingInfo, null)
    return irrigationMainPipeLineWeight(esriSlsWidth(sym), mapZoom)
  }
  const fieldExpr = arcgisUniqueValueKeyExpression(ren)
  const infos = flattenArcgisUniqueValueInfos(ren)
  const widthExpr: unknown[] = ['match', fieldExpr]
  for (const uvi of infos) {
    const v = normalizeUniqueValueKey(uvi?.value)
    if (!v) continue
    const w = irrigationMainPipeLineWeight(esriSlsWidth(uvi?.symbol), mapZoom)
    pushWidthMatchKeys(widthExpr, v, String(uvi?.label ?? ''), w)
  }
  const defSym = (ren as { defaultSymbol?: unknown }).defaultSymbol ?? infos[infos.length - 1]?.symbol
  widthExpr.push(irrigationMainPipeLineWeight(esriSlsWidth(defSym), mapZoom))
  return widthExpr
}

function buildMainPipeDashExpression(
  drawingInfo: Record<string, unknown> | null | undefined,
): unknown[] | undefined {
  const ren = (drawingInfo as { renderer?: { type?: string } } | null)?.renderer
  if (!ren) return undefined
  if (ren.type === 'simple') {
    const dash = esriSlsDashArray((ren as { symbol?: unknown }).symbol)
    return dash ? ['literal', dash] : undefined
  }
  if (ren.type !== 'uniqueValue') return undefined
  const fieldExpr = arcgisUniqueValueKeyExpression(ren)
  const infos = flattenArcgisUniqueValueInfos(ren)
  const dashExpr: unknown[] = ['match', fieldExpr]
  let anyDash = false
  for (const uvi of infos) {
    const v = normalizeUniqueValueKey(uvi?.value)
    if (!v) continue
    const dash = esriSlsDashArray(uvi?.symbol)
    if (!dash) continue
    anyDash = true
    pushDashMatchKeys(dashExpr, v, String(uvi?.label ?? ''), dash)
  }
  const defSym = (ren as { defaultSymbol?: unknown }).defaultSymbol
  const defDash = esriSlsDashArray(defSym) ?? [1, 0]
  dashExpr.push(defDash)
  return anyDash ? dashExpr : undefined
}

export function developEliteMapLibreMainPipeLinePaint(
  drawingInfo: Record<string, unknown> | null | undefined,
  mapZoom: number,
): Record<string, unknown> {
  const op = layerOpacityFromDrawingInfo(drawingInfo)
  const fallback = '#004da8'
  const fromArcgis = arcgisDrawingInfoToLinePaint(drawingInfo, fallback)
  const paint: Record<string, unknown> = {
    'line-color': fromArcgis?.['line-color'] ?? fallback,
    'line-width': buildMainPipeWidthExpression(drawingInfo, mapZoom),
    'line-opacity': fromArcgis?.['line-opacity'] ?? 0.9,
    'line-cap': 'round',
    'line-join': 'round',
  }
  const dash = buildMainPipeDashExpression(drawingInfo)
  if (dash) paint['line-dasharray'] = dash
  return sanitizeMapboxPaint(scalePaintOpacity(paint, op))
}

export function buildDevelopEliteMainPipeArrowGeoJson(
  geojson: GeoJSON.FeatureCollection,
  drawingInfo: Record<string, unknown> | null | undefined,
  mapZoom: number,
  latitudeDeg: number,
): GeoJSON.FeatureCollection {
  if (!irrigationMainPipeShowFlowArrows(mapZoom) || !geojson.features.length) {
    return { type: 'FeatureCollection', features: [] }
  }
  const layerOpacity = layerOpacityFromDrawingInfo(drawingInfo)
  const spacing = irrigationMainPipeArrowSpacingMeters(mapZoom, latitudeDeg)
  const out: GeoJSON.Feature[] = []
  for (const feature of geojson.features) {
    const style = irrigationMainPipePathOptions(drawingInfo, feature.properties, mapZoom, { layerOpacity })
    const color = String(style.color ?? '#004da8')
    const weight = style.weight ?? 4
    const size = irrigationMainPipeArrowSizePx(weight)
    const placements = collectIrrigationMainPipeArrowPlacements(feature.geometry ?? null, spacing)
    for (const placement of placements) {
      out.push({
        type: 'Feature',
        properties: {
          bearing: placement.bearingDeg,
          color,
          size,
        },
        geometry: { type: 'Point', coordinates: [placement.lng, placement.lat] },
      })
    }
  }
  return { type: 'FeatureCollection', features: out }
}

export function syncDevelopEliteMainPipeArrowLayer(
  map: MaplibreMap,
  arrowGeoJson: GeoJSON.FeatureCollection,
  visible: boolean,
): void {
  developEliteMapLibreRunIfStyleReady(map, map => {
  const existing = map.getSource(SRC_ARROWS) as GeoJSONSource | undefined
  if (existing?.setData) {
    existing.setData(arrowGeoJson)
  } else {
    if (map.getSource(SRC_ARROWS)) map.removeSource(SRC_ARROWS)
    map.addSource(SRC_ARROWS, { type: 'geojson', data: arrowGeoJson })
  }

  const layout = {
    visibility: visible ? 'visible' : 'none',
    'text-field': '▶',
    'text-size': ['get', 'size'],
    'text-rotate': ['get', 'bearing'],
    'text-rotation-alignment': 'map',
    'text-keep-upright': false,
    'text-allow-overlap': true,
    'text-ignore-placement': true,
    'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
  }
  const paint = {
    'text-color': ['get', 'color'],
    'text-opacity': 0.95,
  }

  if (!developEliteMapLibreHasLayer(map, LAYER_IRRIGATION_MAIN_PIPE_ARROWS)) {
    map.addLayer({
      id: LAYER_IRRIGATION_MAIN_PIPE_ARROWS,
      type: 'symbol',
      source: SRC_ARROWS,
      layout,
      paint,
    })
  } else {
    Object.entries(layout).forEach(([k, v]) => map.setLayoutProperty(LAYER_IRRIGATION_MAIN_PIPE_ARROWS, k, v))
    Object.entries(paint).forEach(([k, v]) => map.setPaintProperty(LAYER_IRRIGATION_MAIN_PIPE_ARROWS, k, v))
  }
  })
}
