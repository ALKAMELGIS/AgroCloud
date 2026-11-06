import {
  flattenArcgisUniqueValueInfos,
  normalizeUniqueValueKey,
  pickRendererPrimaryField,
} from '@/modules/gis/layers/arcgisDrawingInfoMapbox'
import { arcgisFeatureToLeafletPathOptions } from '@/modules/gis/layers/arcgisDrawingInfoLeaflet'

/** Date palm crown column height in Develop Elite 3D (meters). */
export const DEVELOP_ELITE_PALM_TREE_EXTRUSION_HEIGHT_M = 9

/** Narrow trunk footprint for palm fill-extrusion columns. */
export const DEVELOP_ELITE_PALM_TREE_FOOTPRINT_RADIUS_M = 0.9

export type DevelopEliteTreeExtrusionKind = 'palm' | 'fruit' | 'citrus' | 'vine' | 'default'

const PALM_LABEL_RE = /palm|نخيل|نخلة|date\s*tree|date\s*palm|khaleej|khalij/i
const FRUIT_LABEL_RE =
  /fruit|apple|mango|banana|fig|berry|peach|pear|cherry|pomegranate|فاكه|فواكه|تفاح|مانجو|رمان|مشمش/i
const CITRUS_LABEL_RE = /citrus|lemon|orange|lime|grapefruit|citron|ليمون|برتقال|حمض|كينو/i
const VINE_LABEL_RE = /grape|vine|كرمة|عنب|vitis/i

const TREE_TYPE_PROPERTY_KEYS = [
  'Tree_Type',
  'TREE_TYPE',
  'TreeType',
  'Species',
  'Subtype',
  'Name',
] as const

const KIND_STYLE: Record<
  DevelopEliteTreeExtrusionKind,
  { heightM: number; radiusM: number; fallbackColor: string }
> = {
  palm: {
    heightM: DEVELOP_ELITE_PALM_TREE_EXTRUSION_HEIGHT_M,
    radiusM: DEVELOP_ELITE_PALM_TREE_FOOTPRINT_RADIUS_M,
    fallbackColor: '#a16207',
  },
  fruit: { heightM: 5.2, radiusM: 1.35, fallbackColor: '#16a34a' },
  citrus: { heightM: 4.6, radiusM: 1.2, fallbackColor: '#ca8a04' },
  vine: { heightM: 2.8, radiusM: 1.75, fallbackColor: '#7c3aed' },
  default: { heightM: 3.6, radiusM: 1.05, fallbackColor: '#22c55e' },
}

function readTreeAttribute(props: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    const v = String(props[key] ?? '').trim()
    if (v) return v
  }
  return ''
}

function uniqueValueLabelForFeature(
  drawingInfo: Record<string, unknown> | null | undefined,
  props: Record<string, unknown>,
): string {
  const ren = (drawingInfo as { renderer?: { type?: string } } | null)?.renderer
  if (!ren || String(ren.type || '') !== 'uniqueValue') return ''
  const field = pickRendererPrimaryField(ren)
  if (!field) return ''
  const variants = [field, field.replace(/\s+/g, '_'), field.replace(/\s+/g, '')]
  let raw: unknown
  for (const v of variants) {
    if (props[v] != null && String(props[v]).trim()) {
      raw = props[v]
      break
    }
  }
  if (raw == null) return ''
  const key = normalizeUniqueValueKey(raw)
  for (const uvi of flattenArcgisUniqueValueInfos(ren)) {
    if (normalizeUniqueValueKey(uvi?.value) === key) {
      return String(uvi?.label ?? '').trim()
    }
  }
  return ''
}

/** Combined attribute + ArcGIS class label used for tree-type heuristics. */
export function developEliteTreeFeatureLabel(
  props: Record<string, unknown>,
  drawingInfo?: Record<string, unknown> | null,
): string {
  const direct = readTreeAttribute(props, TREE_TYPE_PROPERTY_KEYS)
  const fromRenderer = uniqueValueLabelForFeature(drawingInfo, props)
  return [direct, fromRenderer].filter(Boolean).join(' ')
}

export function developEliteTreeFeatureKind(
  props: Record<string, unknown>,
  drawingInfo?: Record<string, unknown> | null,
): DevelopEliteTreeExtrusionKind {
  const label = developEliteTreeFeatureLabel(props, drawingInfo)
  if (!label) return 'default'
  if (PALM_LABEL_RE.test(label)) return 'palm'
  if (VINE_LABEL_RE.test(label)) return 'vine'
  if (CITRUS_LABEL_RE.test(label)) return 'citrus'
  if (FRUIT_LABEL_RE.test(label)) return 'fruit'
  return 'default'
}

/** @deprecated Use {@link developEliteTreeFeatureKind} === 'palm' */
export function developEliteTreeFeatureIsPalm(
  props: Record<string, unknown>,
  drawingInfo?: Record<string, unknown> | null,
): boolean {
  return developEliteTreeFeatureKind(props, drawingInfo) === 'palm'
}

function pointFootprintPolygon(lng: number, lat: number, radiusM: number): GeoJSON.Polygon {
  const latRad = (lat * Math.PI) / 180
  const cosLat = Math.max(0.2, Math.cos(latRad))
  const dLng = radiusM / (111320 * cosLat)
  const dLat = radiusM / 110540
  return {
    type: 'Polygon',
    coordinates: [
      [
        [lng - dLng, lat - dLat],
        [lng + dLng, lat - dLat],
        [lng + dLng, lat + dLat],
        [lng - dLng, lat + dLat],
        [lng - dLng, lat - dLat],
      ],
    ],
  }
}

function treeExtrusionColor(
  props: Record<string, unknown>,
  drawingInfo: Record<string, unknown> | null | undefined,
  kind: DevelopEliteTreeExtrusionKind,
): string {
  const style = arcgisFeatureToLeafletPathOptions(drawingInfo, props)
  const fill = style.fillColor
  if (fill && fill !== 'transparent') return fill
  const stroke = style.color
  if (stroke && stroke !== 'transparent') return stroke
  return KIND_STYLE[kind].fallbackColor
}

/** Simple 3D columns for every tree point — palm (tall), fruit/citrus (orchard), vine (low bush), default. */
export function buildDevelopEliteTreeExtrusionGeoJson(
  fc: GeoJSON.FeatureCollection,
  drawingInfo: Record<string, unknown> | null | undefined,
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = []
  for (const feature of fc.features) {
    if (!feature.geometry || feature.geometry.type !== 'Point') continue
    const coords = feature.geometry.coordinates
    if (!Array.isArray(coords) || coords.length < 2) continue
    const props = (feature.properties ?? {}) as Record<string, unknown>
    const kind = developEliteTreeFeatureKind(props, drawingInfo)
    const spec = KIND_STYLE[kind]
    const lng = Number(coords[0])
    const lat = Number(coords[1])
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue
    features.push({
      type: 'Feature',
      properties: {
        de_tree_kind: kind,
        de_extrude_h: spec.heightM,
        de_extrude_color: treeExtrusionColor(props, drawingInfo, kind),
      },
      geometry: pointFootprintPolygon(lng, lat, spec.radiusM),
    })
  }
  return { type: 'FeatureCollection', features }
}

/** @deprecated Use {@link buildDevelopEliteTreeExtrusionGeoJson} */
export function buildDevelopElitePalmTreeExtrusionGeoJson(
  fc: GeoJSON.FeatureCollection,
  drawingInfo: Record<string, unknown> | null | undefined,
): GeoJSON.FeatureCollection {
  const all = buildDevelopEliteTreeExtrusionGeoJson(fc, drawingInfo)
  return {
    type: 'FeatureCollection',
    features: all.features.filter(f => f.properties?.de_tree_kind === 'palm'),
  }
}

export function developEliteMapLibreTreeExtrusionPaint(): Record<string, unknown> {
  return {
    'fill-extrusion-color': ['get', 'de_extrude_color'],
    'fill-extrusion-height': ['get', 'de_extrude_h'],
    'fill-extrusion-opacity': 0.92,
    'fill-extrusion-base': 0,
    'fill-extrusion-vertical-gradient': true,
  }
}

/** @deprecated Use {@link developEliteMapLibreTreeExtrusionPaint} */
export function developEliteMapLibrePalmTreeExtrusionPaint(): Record<string, unknown> {
  return developEliteMapLibreTreeExtrusionPaint()
}
