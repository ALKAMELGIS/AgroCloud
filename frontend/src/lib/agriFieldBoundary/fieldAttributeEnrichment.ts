/**
 * Fill detected polygons with Example.xlsx attribute columns (Sentinel-2 zonal
 * statistics + Prithvi crop typing + Open-Meteo water proxies).
 */

import * as turf from '@turf/turf'

import type { CropAlertFieldInput } from '../siCropAlertEngine'
import {
  buildAgriculturalObjectIntelligenceModel,
  type AgriObjectIntelProgress,
  type AgriObjectReportRow,
} from '../../pages/satellite/lib/timeSeriesReport/buildAgriculturalObjectIntelligenceModel'
import {
  classifyFieldParcelsCropTypes,
  cropHintsMapFromParcelResults,
} from './fieldParcelCropTypingClient'
import { HLS_INPUT_CHANNELS } from './hlsCropTypeNormalize'
import {
  FIELD_DASH_TS_PROP,
  serializeFieldDashTimeSeries,
} from '../../pages/satellite/components/fieldAttributesDashboardTimeSeries'
import {
  loadObjectAttributesSchema,
  getObjectAttributesSchemaSync,
  objectAttributeFieldNames,
  orderedObjectAttributePropertyKeys,
  layerHasObjectAttributeTable,
  OBJECT_ATTRIBUTES_STAMP,
  type ObjectAttributesSchema,
  type ObjectAttributeFieldDef,
} from '../objectAttributes/objectAttributesSchema'
import { mapReportRowToObjectAttributes } from '../objectAttributes/objectAttributesMapper'

export type FieldAttributeColumn = ObjectAttributeFieldDef & {
  /** Alias: GeoJSON property name (same as Excel header). */
  prop: string
  /** Alias: DBF column name. */
  dbf: string
  numeric?: boolean
}

/** @deprecated use loadObjectAttributesSchema — populated after first load. */
export function getFieldAttributeColumns(): FieldAttributeColumn[] {
  return getObjectAttributesSchemaSync().fields.map(f => ({
    ...f,
    prop: f.name,
    numeric: f.type === 'number',
  }))
}

/** Lazy mirror for legacy imports — refreshes after schema load. */
export let FIELD_ATTRIBUTE_COLUMNS: FieldAttributeColumn[] = getFieldAttributeColumns()

async function refreshFieldAttributeColumns(): Promise<void> {
  const schema = await loadObjectAttributesSchema()
  FIELD_ATTRIBUTE_COLUMNS = schema.fields.map(f => ({
    ...f,
    prop: f.name,
    numeric: f.type === 'number',
  }))
}

/**
 * Full Sentinel-2 Layer index set for zonal statistics.
 */
export const FIELD_ATTRIBUTE_LAYER_IDS = [
  'NDVI',
  'NDWI',
  'NDMI',
  'EVI',
  'SAVI',
  'CI_RE',
  'NDSI',
  'SI',
  'SSI',
  'NDRE',
  'MSAVI',
  'NBR',
] as const

/** @deprecated use OBJECT_ATTRIBUTES_STAMP */
export const FIELD_ATTRIBUTES_STAMP = OBJECT_ATTRIBUTES_STAMP

const SPARSE_SCENE_COUNT = 5

export function orderedFieldAttributePropertyKeys(
  props?: Record<string, unknown> | null,
): string[] {
  return orderedObjectAttributePropertyKeys(props)
}

export function layerHasFieldAttributeTable(fc: GeoJSON.FeatureCollection | null | undefined): boolean {
  return layerHasObjectAttributeTable(fc)
}

export type EnrichFieldAttributesOptions = {
  fromDate: string
  toDate: string
  layerName?: string
  layerIds?: string[]
  signal?: AbortSignal
  onProgress?: (p: AgriObjectIntelProgress) => void
  schema?: ObjectAttributesSchema
}

export function hasFieldAttributes(fc: GeoJSON.FeatureCollection | null | undefined): boolean {
  return layerHasObjectAttributeTable(fc)
}

export function fieldAttributesNeedRefresh(
  fc: GeoJSON.FeatureCollection | null | undefined,
): boolean {
  if (!hasFieldAttributes(fc)) return true
  const first = fc?.features?.[0]?.properties as Record<string, unknown> | undefined
  if (!first) return true
  const ndvi = first.NDVI
  if (ndvi == null || ndvi === '') return true
  const ts = first['Time-Series Data Available']
  if (ts != null && String(ts).trim() && !/^No$/i.test(String(ts))) return false
  // Example schema: refresh when NDVI is 0 and no time series stamp
  if (Number(ndvi) === 0 && first.CROP_TYPE === 'None') return false
  return Number(ndvi) === 0
}

function fieldKeyOf(index: number): string {
  return `afb-${index + 1}`
}

function stripReportProps(feature: GeoJSON.Feature, schema: ObjectAttributesSchema): GeoJSON.Feature {
  const props = { ...(feature.properties || {}) } as Record<string, unknown>
  for (const col of schema.fields) {
    delete props[col.name]
  }
  delete props[OBJECT_ATTRIBUTES_STAMP]
  delete props.attributes_period
  return { ...feature, properties: props }
}

function centroidOf(feature: GeoJSON.Feature): [number, number] | null {
  try {
    const c = turf.centerOfMass(feature as GeoJSON.Feature)?.geometry?.coordinates
    if (!Array.isArray(c) || c.length < 2) return null
    const lon = Number(c[0])
    const lat = Number(c[1])
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null
    return [lon, lat]
  } catch {
    return null
  }
}

function periodDays(fromDate: string, toDate: string): number {
  const ms = Date.parse(toDate) - Date.parse(fromDate)
  return Math.max(1, Math.round(ms / (24 * 3600 * 1000)) + 1)
}

function stampRow(
  feature: GeoJSON.Feature,
  attrs: Record<string, string | number>,
  schema: ObjectAttributesSchema,
  meta: { fromDate: string; toDate: string; cropEngineLabel?: string },
): GeoJSON.Feature {
  const props: Record<string, unknown> = {}
  for (const col of schema.fields) {
    props[col.name] = attrs[col.name] ?? col.emptyValue
  }
  for (const [key, value] of Object.entries(feature.properties || {})) {
    if (!(key in props)) props[key] = value
  }
  props[OBJECT_ATTRIBUTES_STAMP] = meta.cropEngineLabel
    ? `Example.xlsx · Sentinel-2 + ${meta.cropEngineLabel} + Open-Meteo`
    : 'Example.xlsx · Sentinel-2 zonal + Open-Meteo'
  props.attributes_period = `${meta.fromDate} → ${meta.toDate}`
  return { ...feature, properties: props }
}

export async function enrichFieldAttributesFromSentinel2(
  fc: GeoJSON.FeatureCollection,
  opts: EnrichFieldAttributesOptions,
): Promise<GeoJSON.FeatureCollection> {
  const schema = opts.schema ?? (await loadObjectAttributesSchema())
  await refreshFieldAttributeColumns()

  const features = (fc?.features || []).filter(
    f => f?.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'),
  )
  if (!features.length) return fc

  const days = periodDays(opts.fromDate, opts.toDate)
  const plots: CropAlertFieldInput[] = []
  const sourceFeatures: Array<{
    fieldKey: string
    feature: GeoJSON.Feature
    original: GeoJSON.Feature
    index: number
  }> = []

  features.forEach((feature, index) => {
    const centroid = centroidOf(feature)
    if (!centroid) return
    const fieldKey = fieldKeyOf(index)
    const cleaned = stripReportProps(feature, schema)
    plots.push({
      fieldKey,
      objectId: String(
        (cleaned.properties as Record<string, unknown> | null)?.field_id ?? index + 1,
      ),
      farmName: `Field ${index + 1}`,
      farmCode: fieldKey,
      structureType: 'Agricultural field',
      country: '',
      city: '',
      centroid,
      geometry: cleaned.geometry,
    })
    sourceFeatures.push({ fieldKey, feature: cleaned, original: feature, index })
  })
  if (!plots.length) return fc

  let cropByFieldKey: Map<string, { cropType: string; confidencePct: number; engine: string }> =
    new Map()
  let cropEngineLabel = ''
  try {
    opts.onProgress?.({
      stage: 'object_analysis',
      label: `HLS crop typing — build 18-band stack (T1–T3 × B02,B03,B04,B8A,B11,B12 = ${HLS_INPUT_CHANNELS} ch)…`,
      done: 0,
      total: plots.length,
    })
    const cropRes = await classifyFieldParcelsCropTypes(
      plots.map(p => ({ fieldKey: p.fieldKey, geometry: p.geometry! })),
      { start: opts.fromDate, end: opts.toDate },
      opts.signal,
    )
    cropByFieldKey = cropHintsMapFromParcelResults(cropRes.parcels)
    cropEngineLabel =
      cropRes.engine?.includes('prithvi') || cropRes.engine?.includes('hls')
        ? `HLS Prithvi (${HLS_INPUT_CHANNELS} ch)`
        : cropRes.engine || ''
    opts.onProgress?.({
      stage: 'object_analysis',
      label: `CROP_TYPE via HLS — ${cropByFieldKey.size}/${plots.length} fields classified`,
      done: cropByFieldKey.size,
      total: plots.length,
    })
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err
    opts.onProgress?.({
      stage: 'object_analysis',
      label: 'Crop classification unavailable — indices-only attributes',
      done: 0,
      total: plots.length,
    })
  }

  const model = await buildAgriculturalObjectIntelligenceModel({
    plots,
    features: sourceFeatures.map(s => ({ fieldKey: s.fieldKey, feature: s.feature })),
    layerName: opts.layerName || 'Detected field boundaries',
    fromDate: opts.fromDate,
    toDate: opts.toDate,
    layerIds: opts.layerIds?.length ? opts.layerIds : [...FIELD_ATTRIBUTE_LAYER_IDS],
    cropByFieldKey,
    cropEngineLabel,
    signal: opts.signal,
    onProgress: opts.onProgress,
  })

  const rowByKey = new Map(model.objects.map(row => [row.fieldKey, row]))
  const keyByOriginal = new Map(sourceFeatures.map(s => [s.original, s]))
  const dashTsJson = model.dashboardTimeSeries
    ? serializeFieldDashTimeSeries(model.dashboardTimeSeries)
    : null
  let dashTsStamped = false

  return {
    ...fc,
    features: (fc.features || []).map(f => {
      const src = keyByOriginal.get(f)
      if (!src) return f
      const row = rowByKey.get(src.fieldKey) as AgriObjectReportRow | undefined
      const attrs = row
        ? mapReportRowToObjectAttributes(row, { index: src.index, periodDays: days }, schema)
        : Object.fromEntries(schema.fields.map(col => [col.name, col.emptyValue]))
      let out = stampRow(stripReportProps(f, schema), attrs, schema, { ...opts, cropEngineLabel })
      if (dashTsJson && !dashTsStamped) {
        dashTsStamped = true
        out = {
          ...out,
          properties: {
            ...(out.properties as Record<string, unknown>),
            [FIELD_DASH_TS_PROP]: dashTsJson,
          },
        }
      }
      return out
    }),
  }
}

/** Preload Example.xlsx schema (call once at app startup). */
export async function preloadObjectAttributesSchema(): Promise<ObjectAttributesSchema> {
  const schema = await loadObjectAttributesSchema()
  await refreshFieldAttributeColumns()
  return schema
}

export function defaultAttributeWindow(sceneDate?: string | null): {
  fromDate: string
  toDate: string
} {
  const end = sceneDate && /^\d{4}-\d{2}-\d{2}/.test(sceneDate) ? new Date(sceneDate) : new Date()
  const start = new Date(end.getTime() - 90 * 24 * 3600 * 1000)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  return { fromDate: iso(start), toDate: iso(end) }
}

export { objectAttributeFieldNames, orderedObjectAttributePropertyKeys, loadObjectAttributesSchema }
