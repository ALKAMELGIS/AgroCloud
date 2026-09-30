/**
 * Master attribute schema loaded dynamically from public/schemas/Example.xlsx.
 * Field names, order, types, and empty-cell formats come from the Excel template only.
 */

import * as XLSX from 'xlsx'

export type ObjectAttributeFieldType = 'string' | 'number'

export type ObjectAttributeFieldDef = {
  /** Exact Excel column header — also the GeoJSON property name. */
  name: string
  type: ObjectAttributeFieldType
  /** Value used when a field cannot be calculated (from Example.xlsx sample rows). */
  emptyValue: string | number
  /** Shapefile DBF column (≤10 ASCII chars). */
  dbf: string
}

export type ObjectAttributesSchema = {
  sheetName: string
  fields: ObjectAttributeFieldDef[]
}

/** Bundled template path (served from Vite public/). */
export const OBJECT_ATTRIBUTES_TEMPLATE_URL = '/schemas/Example.xlsx'

/** Fallback when fetch/parse fails — mirrors Example.xlsx row 0 exactly. */
export const FALLBACK_OBJECT_ATTRIBUTES_SCHEMA: ObjectAttributesSchema = {
  sheetName: 'Data',
  fields: [
    { name: 'OBJECT_ID', type: 'string', emptyValue: 'None', dbf: 'OBJECT_ID' },
    { name: 'OBJECT_TYPE', type: 'string', emptyValue: 'Field', dbf: 'OBJ_TYPE' },
    { name: 'OBJECT_NAME', type: 'string', emptyValue: '', dbf: 'OBJ_NAME' },
    { name: 'AREA_HA', type: 'number', emptyValue: 0, dbf: 'AREA_HA' },
    { name: 'AGRI_STATUS', type: 'string', emptyValue: 'Non-Agricultural', dbf: 'AGRI_STAT' },
    { name: 'ACTIVE_STATUS', type: 'string', emptyValue: 'Inactive', dbf: 'ACTIVE_ST' },
    { name: 'LAND_COVER', type: 'string', emptyValue: 'Bare Soil', dbf: 'LAND_COVER' },
    { name: 'CROP_TYPE', type: 'string', emptyValue: 'None', dbf: 'CROP_TYPE' },
    { name: 'CROP_CONF', type: 'number', emptyValue: 0, dbf: 'CROP_CONF' },
    { name: 'HEALTH_STATUS', type: 'string', emptyValue: 'Uncertain', dbf: 'HLTH_STAT' },
    { name: 'NDVI', type: 'number', emptyValue: 0, dbf: 'NDVI' },
    { name: 'WATER_STRESS', type: 'string', emptyValue: 'Unknown', dbf: 'WATR_STRS' },
    { name: 'SOIL_MOIST', type: 'number', emptyValue: 0, dbf: 'SOIL_MOIST' },
    { name: 'ET_MM_DAY', type: 'number', emptyValue: 0, dbf: 'ET_MM_DAY' },
    { name: 'WATER_REQ', type: 'number', emptyValue: 0, dbf: 'WATER_REQ' },
    { name: 'EST_YIELD', type: 'number', emptyValue: 0, dbf: 'EST_YIELD' },
    { name: 'TOTAL_PROD', type: 'number', emptyValue: 0, dbf: 'TOTAL_PROD' },
    { name: 'CHANGE', type: 'string', emptyValue: 'None', dbf: 'CHANGE' },
    { name: 'ANOMALY', type: 'string', emptyValue: 'None', dbf: 'ANOMALY' },
    { name: 'INSPECT_PRI', type: 'string', emptyValue: 'Low', dbf: 'INSP_PRI' },
  ],
}

let cachedSchema: ObjectAttributesSchema | null = null
let loadPromise: Promise<ObjectAttributesSchema> | null = null

function isNumericCell(v: unknown): boolean {
  return typeof v === 'number' && Number.isFinite(v)
}

function inferFieldType(header: string, samples: unknown[]): ObjectAttributeFieldType {
  const nums = samples.filter(isNumericCell).length
  const strs = samples.filter(v => v != null && v !== '' && !isNumericCell(v)).length
  if (nums > 0 && strs === 0) return 'number'
  if (/^(NDVI|AREA_HA|CROP_CONF|SOIL_MOIST|ET_MM_DAY|WATER_REQ|EST_YIELD|TOTAL_PROD|CHANGE)$/i.test(header)) {
    // CHANGE can be numeric or string in samples — prefer string when mixed
    if (header.toUpperCase() === 'CHANGE' && strs > 0) return 'string'
    if (nums >= strs) return 'number'
  }
  return 'string'
}


function inferEmptyFromRows(fieldIndex: number, rows: unknown[][], type: ObjectAttributeFieldType): string | number {
  // Row 4 in Example.xlsx (index 4) is the inactive / uncertain object
  const inactiveRow = rows[4]
  if (inactiveRow && fieldIndex < inactiveRow.length) {
    const v = inactiveRow[fieldIndex]
    if (type === 'number') {
      if (isNumericCell(v)) return v as number
      if (v == null || v === '') return 0
      const n = Number(v)
      return Number.isFinite(n) ? n : 0
    }
    if (v != null && v !== '') return String(v)
  }
  if (type === 'number') return 0
  return ''
}

function dbfNameFor(header: string, used: Set<string>): string {
  let base = header
    .replace(/[^A-Za-z0-9_]/g, '_')
    .replace(/^_+/, '')
    .toUpperCase()
    .slice(0, 10)
  if (!base || !/^[A-Z]/.test(base)) base = `F_${base || 'ATTR'}`.slice(0, 10)
  let name = base
  let n = 1
  while (used.has(name)) {
    const suffix = String(n++)
    name = `${base.slice(0, Math.max(1, 10 - suffix.length))}${suffix}`
  }
  used.add(name)
  return name
}

/** Parse workbook bytes into the master schema (first sheet, row 0 = headers). */
export function parseObjectAttributesWorkbook(data: ArrayBuffer | Uint8Array | Buffer): ObjectAttributesSchema {
  const wb = XLSX.read(data, {
    type: data instanceof ArrayBuffer ? 'array' : 'buffer',
  })
  const sheetName = wb.SheetNames[0] ?? 'Data'
  const ws = wb.Sheets[sheetName]
  if (!ws) return FALLBACK_OBJECT_ATTRIBUTES_SCHEMA

  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null }) as unknown[][]
  if (!rows.length || !Array.isArray(rows[0])) return FALLBACK_OBJECT_ATTRIBUTES_SCHEMA

  const headers = (rows[0] as unknown[]).map(h => String(h ?? '').trim()).filter(Boolean)
  if (!headers.length) return FALLBACK_OBJECT_ATTRIBUTES_SCHEMA

  const dataRows = rows.slice(1).filter(r => Array.isArray(r) && r.some(c => c != null && c !== ''))
  const usedDbf = new Set<string>()
  const fields: ObjectAttributeFieldDef[] = headers.map((name, colIdx) => {
    const colSamples = dataRows.map(r => (r as unknown[])[colIdx]).filter(v => v != null && v !== '')
    const type = inferFieldType(name, colSamples)
    const emptyValue = inferEmptyFromRows(colIdx, rows as unknown[][], type)
    const fallback = FALLBACK_OBJECT_ATTRIBUTES_SCHEMA.fields.find(f => f.name === name)
    return {
      name,
      type,
      emptyValue: emptyValue !== '' && emptyValue != null ? emptyValue : (fallback?.emptyValue ?? (type === 'number' ? 0 : '')),
      dbf: fallback?.dbf ?? dbfNameFor(name, usedDbf),
    }
  })

  return { sheetName, fields }
}

/** Load schema from URL (cached). */
export async function loadObjectAttributesSchema(url = OBJECT_ATTRIBUTES_TEMPLATE_URL): Promise<ObjectAttributesSchema> {
  if (cachedSchema) return cachedSchema
  if (loadPromise) return loadPromise

  loadPromise = (async () => {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const buf = await res.arrayBuffer()
      cachedSchema = parseObjectAttributesWorkbook(buf)
      return cachedSchema
    } catch {
      cachedSchema = FALLBACK_OBJECT_ATTRIBUTES_SCHEMA
      return cachedSchema
    } finally {
      loadPromise = null
    }
  })()

  return loadPromise
}

/** Sync access after first load; otherwise fallback. */
export function getObjectAttributesSchemaSync(): ObjectAttributesSchema {
  return cachedSchema ?? FALLBACK_OBJECT_ATTRIBUTES_SCHEMA
}

/** Test helper — reset cache between tests. */
export function resetObjectAttributesSchemaCache(): void {
  cachedSchema = null
  loadPromise = null
}

export const OBJECT_ATTRIBUTES_STAMP = 'object_attributes_schema'

/** Ordered Excel field names. */
export function objectAttributeFieldNames(schema?: ObjectAttributesSchema): string[] {
  return (schema ?? getObjectAttributesSchemaSync()).fields.map(f => f.name)
}

/** Property key order: schema columns first, then optional internals. */
export function orderedObjectAttributePropertyKeys(
  props?: Record<string, unknown> | null,
  schema?: ObjectAttributesSchema,
): string[] {
  const sch = schema ?? getObjectAttributesSchemaSync()
  const report = sch.fields.map(f => f.name)
  const internal = [
    'attributes_period',
    OBJECT_ATTRIBUTES_STAMP,
    'area_ha',
    'area_m2',
    'confidence',
    'field_id',
    'detection_engine',
    'engine',
    'source',
    'stroke',
    'stroke_color',
    'stroke_width',
    'fill',
    'fill_color',
    'fill_opacity',
    'class_name',
    'output_type',
  ]
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const k of [...report, ...internal]) {
    if (seen.has(k)) continue
    seen.add(k)
    ordered.push(k)
  }
  if (props && typeof props === 'object') {
    for (const k of Object.keys(props)) {
      if (!seen.has(k)) ordered.push(k)
    }
  }
  return ordered
}

export function layerHasObjectAttributeTable(fc: GeoJSON.FeatureCollection | null | undefined): boolean {
  const first = fc?.features?.[0]?.properties as Record<string, unknown> | undefined
  return Boolean(first && first[OBJECT_ATTRIBUTES_STAMP])
}

/** Internal detection props hidden when Example.xlsx columns are present. */
export const OBJECT_ATTRIBUTE_INTERNAL_KEYS = new Set([
  'area_ha',
  'area_m2',
  'confidence',
  'confidence_mean',
  'engine',
  'field_id',
  'source',
  'stroke',
  'stroke_color',
  'stroke_width',
  'fill',
  'fill_color',
  'fill_opacity',
  'class_name',
  'output_type',
  OBJECT_ATTRIBUTES_STAMP,
  'attributes_period',
])

/** Attribute-table column order: Example.xlsx first, then extras. */
export function objectAttributeTableColumns(featureKeys: string[]): string[] {
  const schema = objectAttributeFieldNames()
  const keySet = new Set(featureKeys)
  const hasSchema = schema.some(f => keySet.has(f))
  if (!hasSchema) return [...featureKeys].sort((a, b) => a.localeCompare(b))
  return [
    ...schema.filter(f => keySet.has(f)),
    ...featureKeys.filter(f => !schema.includes(f) && !OBJECT_ATTRIBUTE_INTERNAL_KEYS.has(f)),
  ]
}
