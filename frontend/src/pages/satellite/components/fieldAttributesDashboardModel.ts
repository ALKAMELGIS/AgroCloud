/**
 * Aggregate Example.xlsx attribute columns for KPI cards and static dashboard charts.
 */

import {
  getObjectAttributesSchemaSync,
  type ObjectAttributeFieldDef,
  type ObjectAttributesSchema,
} from '../../../lib/objectAttributes/objectAttributesSchema'
import {
  readFieldDashTimeSeriesFromGeojson,
  type FieldDashIndexTimeSeries,
} from './fieldAttributesDashboardTimeSeries'

export type NamedCount = { label: string; count: number }

export type AttributeFieldChart = {
  fieldName: string
  label: string
  rows: NamedCount[]
}

export type FieldAttributesDashboardModel = {
  fieldCount: number
  totalAreaHa: number
  meanNdvi: number | null
  meanCropConf: number | null
  healthyPct: number | null
  highInspectCount: number
  cropTypeCount: number
  provider: string
  engine: string | null
  sceneDate: string | null
  areaByField: Array<{ label: string; value: number }>
  cropMix: NamedCount[]
  healthMix: NamedCount[]
  landCoverMix: NamedCount[]
  ndviBuckets: NamedCount[]
  ndviByField: Array<{ label: string; ndvi: number }>
  /** AOI-mean Sentinel-2 index time series (NDVI, NDRE, NDMI, NDWI, SAVI, ET). */
  indexTimeSeries: FieldDashIndexTimeSeries | null
  /** Remaining Example.xlsx string fields with distribution data. */
  attributeMixes: AttributeFieldChart[]
}

const DEDICATED_STRING_FIELDS = new Set(['CROP_TYPE', 'HEALTH_STATUS', 'LAND_COVER'])
const SKIP_CATEGORY_FIELDS = new Set(['OBJECT_ID', 'OBJECT_NAME', 'OBJECT_TYPE'])

function schemaField(schema: ObjectAttributesSchema, name: string): ObjectAttributeFieldDef | undefined {
  return schema.fields.find(f => f.name === name)
}

function isEmptyAttributeValue(v: unknown, emptyValue: string | number): boolean {
  if (v == null || v === '') return true
  if (typeof emptyValue === 'number') {
    const n = Number(v)
    return Number.isFinite(n) && n === emptyValue
  }
  const s = String(v).trim()
  return !s || s === String(emptyValue).trim() || s === 'None' || s === '—'
}

function propNum(props: Record<string, unknown>, field?: ObjectAttributeFieldDef): number | null {
  if (!field) return null
  const v = props[field.name]
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (isEmptyAttributeValue(v, field.emptyValue)) return null
  const n = Number(String(v).replace(/[^\d.+-eE]/g, ''))
  return Number.isFinite(n) ? n : null
}

function propStr(props: Record<string, unknown>, field?: ObjectAttributeFieldDef): string {
  if (!field) return ''
  const v = props[field.name]
  if (isEmptyAttributeValue(v, field.emptyValue)) return ''
  return String(v).trim()
}

function bump(map: Map<string, number>, label: string) {
  const key = label.trim() || 'Unknown'
  map.set(key, (map.get(key) ?? 0) + 1)
}

function mapToSortedCounts(map: Map<string, number>, limit = 8): NamedCount[] {
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

function ndviBucket(ndvi: number): string {
  if (ndvi < 0.2) return '< 0.20'
  if (ndvi < 0.4) return '0.20–0.39'
  if (ndvi < 0.6) return '0.40–0.59'
  if (ndvi < 0.8) return '0.60–0.79'
  return '≥ 0.80'
}

function humanizeFieldName(name: string): string {
  return name
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase())
}

export function buildFieldAttributesDashboardModel(
  fc: GeoJSON.FeatureCollection | null | undefined,
  opts?: {
    engine?: string | null
    sceneDate?: string | null
    provider?: string
    schema?: ObjectAttributesSchema
  },
): FieldAttributesDashboardModel | null {
  const features = fc?.features?.filter(f => f?.geometry) ?? []
  if (!features.length) return null

  const schema = opts?.schema ?? getObjectAttributesSchemaSync()
  const nameField = schemaField(schema, 'OBJECT_NAME')
  const areaField = schemaField(schema, 'AREA_HA')
  const ndviField = schemaField(schema, 'NDVI')
  const confField = schemaField(schema, 'CROP_CONF')
  const healthField = schemaField(schema, 'HEALTH_STATUS')
  const cropField = schemaField(schema, 'CROP_TYPE')
  const landField = schemaField(schema, 'LAND_COVER')
  const inspectField = schemaField(schema, 'INSPECT_PRI')

  const extraStringFields = schema.fields.filter(
    f => f.type === 'string' && !SKIP_CATEGORY_FIELDS.has(f.name) && !DEDICATED_STRING_FIELDS.has(f.name),
  )
  const extraMaps = new Map(extraStringFields.map(f => [f.name, new Map<string, number>()]))

  let totalAreaHa = 0
  let ndviSum = 0
  let ndviCount = 0
  let confSum = 0
  let confCount = 0
  let healthy = 0
  let healthTotal = 0
  let highInspect = 0

  const cropMap = new Map<string, number>()
  const healthMap = new Map<string, number>()
  const landMap = new Map<string, number>()
  const ndviMap = new Map<string, number>()
  const areaRows: Array<{ label: string; value: number }> = []
  const ndviRows: Array<{ label: string; ndvi: number }> = []

  features.forEach((f, i) => {
    const props = (f.properties ?? {}) as Record<string, unknown>
    const name = propStr(props, nameField) || `Field ${i + 1}`
    const area = propNum(props, areaField) ?? 0
    totalAreaHa += area
    areaRows.push({ label: name, value: area })

    const ndvi = propNum(props, ndviField)
    if (ndvi != null) {
      ndviSum += ndvi
      ndviCount += 1
      bump(ndviMap, ndviBucket(ndvi))
      ndviRows.push({ label: name, ndvi })
    }

    const conf = propNum(props, confField)
    if (conf != null) {
      confSum += conf
      confCount += 1
    }

    const health = propStr(props, healthField)
    if (health) {
      healthTotal += 1
      bump(healthMap, health)
      if (/healthy/i.test(health) && !/stress|moderate/i.test(health)) healthy += 1
    }

    const crop = propStr(props, cropField)
    if (crop) bump(cropMap, crop)

    const land = propStr(props, landField)
    if (land) bump(landMap, land)

    const inspect = propStr(props, inspectField)
    if (/high/i.test(inspect)) highInspect += 1

    for (const field of extraStringFields) {
      const value = propStr(props, field)
      if (!value) continue
      bump(extraMaps.get(field.name)!, value)
    }
  })

  areaRows.sort((a, b) => b.value - a.value)
  ndviRows.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))

  const attributeMixes: AttributeFieldChart[] = extraStringFields
    .map(field => ({
      fieldName: field.name,
      label: humanizeFieldName(field.name),
      rows: mapToSortedCounts(extraMaps.get(field.name) ?? new Map()),
    }))
    .filter(chart => chart.rows.length > 0)

  return {
    fieldCount: features.length,
    totalAreaHa: Math.round(totalAreaHa * 100) / 100,
    meanNdvi: ndviCount ? Math.round((ndviSum / ndviCount) * 100) / 100 : null,
    meanCropConf: confCount ? Math.round((confSum / confCount) * 100) / 100 : null,
    healthyPct: healthTotal ? Math.round((healthy / healthTotal) * 100) : null,
    highInspectCount: highInspect,
    cropTypeCount: cropMap.size,
    provider: opts?.provider ?? 'Sentinel-2 L2A',
    engine: opts?.engine ?? null,
    sceneDate: opts?.sceneDate ?? null,
    areaByField: areaRows.slice(0, 14),
    cropMix: mapToSortedCounts(cropMap),
    healthMix: mapToSortedCounts(healthMap),
    landCoverMix: mapToSortedCounts(landMap),
    ndviBuckets: mapToSortedCounts(
      new Map(
        ['< 0.20', '0.20–0.39', '0.40–0.59', '0.60–0.79', '≥ 0.80'].map(k => [k, ndviMap.get(k) ?? 0]),
      ),
    ).filter(r => r.count > 0),
    ndviByField: ndviRows.slice(0, 24),
    indexTimeSeries: readFieldDashTimeSeriesFromGeojson(fc),
    attributeMixes,
  }
}
