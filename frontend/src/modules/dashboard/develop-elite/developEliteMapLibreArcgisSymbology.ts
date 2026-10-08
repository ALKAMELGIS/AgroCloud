import {
  arcgisDrawingInfoToCirclePaint,
  arcgisDrawingInfoToFillPaint,
  arcgisDrawingInfoToLinePaint,
  arcgisUniqueValueKeyExpression,
  buildArcgisUniqueValueLegendItems,
  collectUniqueValueMatchKeys,
  type ArcgisUniqueValueLegendItem,
} from '@/modules/gis/layers/arcgisDrawingInfoMapbox'
import { layerOpacityFromDrawingInfo } from '@/modules/gis/layers/arcgisDrawingInfoLeaflet'
import {
  buildArcgisPointIconImageMatch,
  buildArcgisPointIconLayerSpec,
  ensureArcgisPointIconImages,
  type ArcgisPointIconLayerSpec,
} from '@/modules/gis/layers/arcgisPointSymbolMapbox'
import { sanitizeMapboxPaint } from '@/modules/gis/layers/mapboxPaintSanitize'
import type { Map as MaplibreMap } from 'maplibre-gl'
import { developEliteMapPointZoomScale } from './developEliteMapGeoJsonGeometry'
import { AGRO_STRUCTURES_STRUCTURE_TYPE_CATALOG } from '@/modules/remote-sensing/imagery/agroStructuresPrimaryAoi'

export const DE_MAPLIBRE_POINT_FILTER = [
  'in',
  ['geometry-type'],
  ['literal', ['Point', 'MultiPoint']],
] as const

export const DE_MAPLIBRE_LINE_FILTER = [
  'in',
  ['geometry-type'],
  ['literal', ['LineString', 'MultiLineString']],
] as const

export const DE_MAPLIBRE_POLY_FILTER = [
  'in',
  ['geometry-type'],
  ['literal', ['Polygon', 'MultiPolygon']],
] as const

export const DE_MAPLIBRE_POLY_LINE_FILTER = [
  'in',
  ['geometry-type'],
  ['literal', ['Polygon', 'MultiPolygon', 'LineString', 'MultiLineString']],
] as const

const DEVELOP_ELITE_AGRI_LOCATION_POINT_SCALE = 1.42
const DEVELOP_ELITE_IRRIGATION_VALVES_POINT_SCALE = 1.45

/** Extruded Agro Structures footprint height in 3D terrain view (meters). */
export const DE_AGRO_STRUCTURE_EXTRUSION_HEIGHT_M = 7

/** Greenhouse, Nethouse, Glasshouse, Retractable Roof Houses, Cravo — extrude to 7 m in 3D view. */
const DE_AGRO_STRUCTURE_EXTRUDED_TYPE_CODES = new Set(
  AGRO_STRUCTURES_STRUCTURE_TYPE_CATALOG.slice(0, 5).map(entry => entry.code),
)
const DE_AGRO_STRUCTURE_EXTRUDED_TYPE_LABELS = new Set(
  AGRO_STRUCTURES_STRUCTURE_TYPE_CATALOG.slice(0, 5).map(entry => entry.label.trim().toLowerCase()),
)

export function developEliteAgroStructureExtrusionHeightM(
  item: Pick<ArcgisUniqueValueLegendItem, 'value' | 'label' | 'hollow'>,
): number {
  const code = Number(String(item.value ?? '').trim())
  if (Number.isFinite(code) && DE_AGRO_STRUCTURE_EXTRUDED_TYPE_CODES.has(code)) {
    return DE_AGRO_STRUCTURE_EXTRUSION_HEIGHT_M
  }
  const labelKey = String(item.label ?? '').trim().toLowerCase()
  if (labelKey && DE_AGRO_STRUCTURE_EXTRUDED_TYPE_LABELS.has(labelKey)) {
    return DE_AGRO_STRUCTURE_EXTRUSION_HEIGHT_M
  }
  return 0
}

function buildAgroStructureExtrusionHeightFallbackExpression(): unknown[] {
  const fieldExpr = ['to-string', ['get', 'Structure_Type']]
  const heightExpr: unknown[] = ['match', fieldExpr]
  const keysUsed = new Set<string>()
  for (const { code, label } of AGRO_STRUCTURES_STRUCTURE_TYPE_CATALOG.slice(0, 5)) {
    for (const key of collectUniqueValueMatchKeys(String(code), label)) {
      if (keysUsed.has(key)) continue
      keysUsed.add(key)
      heightExpr.push(key, DE_AGRO_STRUCTURE_EXTRUSION_HEIGHT_M)
    }
  }
  heightExpr.push(0)
  return heightExpr
}

export function developEliteMapLibreScalePaintOpacity(
  paint: Record<string, unknown>,
  factor: number,
): Record<string, unknown> {
  if (!Number.isFinite(factor) || (factor >= 0.999 && factor <= 1.001)) return paint
  return scalePaintOpacity(paint, factor)
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

const DEVELOP_ELITE_MIN_FILL_OPACITY = 0.88
const DEVELOP_ELITE_MIN_LINE_OPACITY = 0.95

function boostDevelopEliteOpacityValue(value: unknown, min: number): unknown {
  if (typeof value === 'number') {
    if (value < 0.04) return value
    return Math.min(1, Math.max(min, value))
  }
  if (!Array.isArray(value) || value.length < 2) return value
  const copy = [...value]
  const op = String(copy[0])
  if (op === 'match') {
    for (let i = 3; i < copy.length - 1; i += 2) {
      if (typeof copy[i] === 'number') copy[i] = boostDevelopEliteOpacityValue(copy[i], min) as number
    }
    const last = copy.length - 1
    if (typeof copy[last] === 'number') {
      copy[last] = boostDevelopEliteOpacityValue(copy[last], min) as number
    }
    return copy
  }
  if (op === 'case') {
    for (let i = 2; i < copy.length - 1; i += 2) {
      if (typeof copy[i] === 'number') copy[i] = boostDevelopEliteOpacityValue(copy[i], min) as number
    }
    const last = copy.length - 1
    if (typeof copy[last] === 'number') {
      copy[last] = boostDevelopEliteOpacityValue(copy[last], min) as number
    }
    return copy
  }
  return value
}

function boostDevelopEliteMapPaintOpacity(
  paint: Record<string, unknown>,
  opts: { minFill?: number; minLine?: number } = {},
): Record<string, unknown> {
  const minFill = opts.minFill ?? DEVELOP_ELITE_MIN_FILL_OPACITY
  const minLine = opts.minLine ?? DEVELOP_ELITE_MIN_LINE_OPACITY
  const next = { ...paint }
  if ('fill-opacity' in next) next['fill-opacity'] = boostDevelopEliteOpacityValue(next['fill-opacity'], minFill)
  if ('fill-extrusion-opacity' in next) {
    next['fill-extrusion-opacity'] = boostDevelopEliteOpacityValue(next['fill-extrusion-opacity'], minFill)
  }
  if ('line-opacity' in next) next['line-opacity'] = boostDevelopEliteOpacityValue(next['line-opacity'], minLine)
  if ('circle-opacity' in next) next['circle-opacity'] = boostDevelopEliteOpacityValue(next['circle-opacity'], minFill)
  if ('circle-stroke-opacity' in next) {
    next['circle-stroke-opacity'] = boostDevelopEliteOpacityValue(next['circle-stroke-opacity'], minLine)
  }
  if ('icon-opacity' in next) next['icon-opacity'] = boostDevelopEliteOpacityValue(next['icon-opacity'], minFill)
  return next
}

export function developEliteMapLibreStructuresPaint(drawingInfo: Record<string, unknown> | null | undefined): {
  fill: Record<string, unknown>
  line: Record<string, unknown>
} {
  const op = layerOpacityFromDrawingInfo(drawingInfo)
  const fill =
    arcgisDrawingInfoToFillPaint(drawingInfo) ??
    ({
      'fill-color': '#5cdb5c',
      'fill-opacity': 0.12,
    } as Record<string, unknown>)
  const line =
    arcgisDrawingInfoToLinePaint(drawingInfo, '#5cdb5c') ??
    ({
      'line-color': '#5cdb5c',
      'line-width': 1.5,
      'line-opacity': 0.9,
    } as Record<string, unknown>)
  return {
    fill: sanitizeMapboxPaint(boostDevelopEliteMapPaintOpacity(scalePaintOpacity(fill, op))),
    line: sanitizeMapboxPaint(boostDevelopEliteMapPaintOpacity(scalePaintOpacity(line, op))),
  }
}

function buildAgroStructureExtrusionHeightExpression(
  drawingInfo: Record<string, unknown> | null | undefined,
): number | unknown[] {
  const op = layerOpacityFromDrawingInfo(drawingInfo)
  const legendItems = buildArcgisUniqueValueLegendItems(drawingInfo, op)
  const ren = (drawingInfo as { renderer?: { type?: string } } | null)?.renderer
  if (!ren || String(ren.type || '') !== 'uniqueValue' || !legendItems.length) {
    return buildAgroStructureExtrusionHeightFallbackExpression()
  }
  const fieldExpr = arcgisUniqueValueKeyExpression(ren)
  const heightExpr: unknown[] = ['match', fieldExpr]
  const keysUsed = new Set<string>()
  for (const item of legendItems) {
    const h = developEliteAgroStructureExtrusionHeightM(item)
    for (const key of collectUniqueValueMatchKeys(item.value, item.label)) {
      if (keysUsed.has(key)) continue
      keysUsed.add(key)
      heightExpr.push(key, h)
    }
  }
  heightExpr.push(0)
  return heightExpr
}

export function developEliteMapLibreStructuresExtrusionPaint(
  drawingInfo: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const { fill } = developEliteMapLibreStructuresPaint(drawingInfo)
  const fillOpacity = fill['fill-opacity']
  return sanitizeMapboxPaint({
    'fill-extrusion-color': fill['fill-color'] ?? '#4ce600',
    'fill-extrusion-opacity':
      typeof fillOpacity === 'number' ? Math.min(0.98, Math.max(DEVELOP_ELITE_MIN_FILL_OPACITY, fillOpacity)) : 0.9,
    'fill-extrusion-height': buildAgroStructureExtrusionHeightExpression(drawingInfo),
    'fill-extrusion-vertical-gradient': true,
  })
}

export function developEliteMapLibreWorldCountriesLinePaint(
  drawingInfo: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const op = layerOpacityFromDrawingInfo(drawingInfo)
  const line =
    arcgisDrawingInfoToLinePaint(drawingInfo, '#5cdb5c') ??
    ({
      'line-color': '#5cdb5c',
      'line-width': 2,
      'line-opacity': 0.95,
    } as Record<string, unknown>)
  return sanitizeMapboxPaint(boostDevelopEliteMapPaintOpacity(scalePaintOpacity(line, op)))
}

export function developEliteMapLibrePointCirclePaint(
  drawingInfo: Record<string, unknown> | null | undefined,
  fallback: { color: string; stroke: string; radius: number },
): Record<string, unknown> {
  const op = layerOpacityFromDrawingInfo(drawingInfo)
  const fromArcgis = arcgisDrawingInfoToCirclePaint(drawingInfo)
  const paint =
    fromArcgis ??
    ({
      'circle-color': fallback.color,
      'circle-radius': fallback.radius,
      'circle-stroke-color': fallback.stroke,
      'circle-stroke-width': 1.5,
      'circle-opacity': 0.9,
    } as Record<string, unknown>)
  return sanitizeMapboxPaint(boostDevelopEliteMapPaintOpacity(scalePaintOpacity(paint, op)))
}

export type DevelopElitePointIconLayerKey = 'trees' | 'irrigation-valves' | 'agri-location'

export function developEliteMapLibrePointIconScale(
  layerKey: DevelopElitePointIconLayerKey,
  mapZoom: number,
): number {
  const base =
    layerKey === 'agri-location'
      ? DEVELOP_ELITE_AGRI_LOCATION_POINT_SCALE
      : layerKey === 'irrigation-valves'
        ? DEVELOP_ELITE_IRRIGATION_VALVES_POINT_SCALE
        : 1
  return base * developEliteMapPointZoomScale(mapZoom)
}

export function developEliteMapLibrePreparePointIcons(
  map: MaplibreMap,
  layerSafeId: string,
  drawingInfo: Record<string, unknown> | null | undefined,
  layerKey: DevelopElitePointIconLayerKey,
  mapZoom: number,
  onIconsLoaded: () => void,
): { spec: ArcgisPointIconLayerSpec | null; iconsReady: boolean; iconSize: number } {
  const spec = buildArcgisPointIconLayerSpec(drawingInfo, layerSafeId)
  if (!spec) return { spec: null, iconsReady: false, iconSize: 1 }
  const iconsReady = ensureArcgisPointIconImages(map, spec, onIconsLoaded)
  const iconSize = spec.iconSize * developEliteMapLibrePointIconScale(layerKey, mapZoom)
  return { spec, iconsReady, iconSize }
}

export function developEliteMapLibrePointIconLayout(
  spec: ArcgisPointIconLayerSpec,
  iconSize: number,
  visible: boolean,
  layerOpacity: number,
): { layout: Record<string, unknown>; paint: Record<string, unknown> } {
  return {
    layout: {
      visibility: visible ? 'visible' : 'none',
      'icon-image': buildArcgisPointIconImageMatch(spec),
      'icon-size': iconSize,
      'icon-anchor': 'center',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
    paint: {
      'icon-opacity': layerOpacity,
      'icon-halo-width': 0,
      'icon-halo-color': 'rgba(0,0,0,0)',
    },
  }
}

/** Identify-only circle — must set every paint key so stale ArcGIS circle-color expressions do not show halos. */
export function developEliteMapLibreInvisibleCircleHitPaint(hitRadius = 8): Record<string, unknown> {
  const radius = Math.max(6, hitRadius)
  return {
    'circle-radius': radius,
    'circle-color': 'rgba(0,0,0,0)',
    'circle-opacity': 0,
    'circle-blur': 0,
    'circle-pitch-scale': 'map',
    'circle-pitch-alignment': 'map',
    'circle-stroke-color': 'rgba(0,0,0,0)',
    'circle-stroke-opacity': 0,
    'circle-stroke-width': 0,
  }
}

/** True when renderer uses esriPMS picture markers (AgroLocation, valves, etc.). */
export function developEliteDrawingInfoUsesPictureMarkers(
  drawingInfo: Record<string, unknown> | null | undefined,
): boolean {
  return Boolean(buildArcgisPointIconLayerSpec(drawingInfo, 'probe')?.entries?.length)
}

/** @deprecated Prefer {@link developEliteMapLibreInvisibleCircleHitPaint} (does not merge prior paint). */
export function developEliteMapLibreHiddenHitCirclePaint(circlePaint: Record<string, unknown>): Record<string, unknown> {
  const hitRadius =
    typeof circlePaint['circle-radius'] === 'number'
      ? Math.max(6, circlePaint['circle-radius'] as number)
      : 8
  return developEliteMapLibreInvisibleCircleHitPaint(hitRadius)
}

/** Invisible footprint for identify when 3D extrusion replaces visible fill. */
export function developEliteMapLibreHiddenHitFillPaint(fillPaint: Record<string, unknown>): Record<string, unknown> {
  return {
    ...fillPaint,
    'fill-opacity': 0.001,
    'fill-outline-color': 'rgba(0,0,0,0)',
  }
}
