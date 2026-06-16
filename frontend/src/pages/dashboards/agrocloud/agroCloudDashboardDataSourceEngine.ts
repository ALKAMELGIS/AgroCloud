import { getGisContentRowById } from '../../../lib/gisContentPortalStore'
import { ensureLayoutDefaults } from './agroCloudDashboardLayout'
import { resolveBodyLayout } from './agroCloudDashboardBodyLayout'
import type { GisContentRow } from '../../master/gisContentPortalData'
import { gisContentPortalDisplayTypeLabel } from '../../master/gisContentPortalData'
import type { AgroCloudDashboardConfig, AgroCloudDashboardElement } from './agroCloudDashboardData'

const GIS_CONTENT_FIELDS_KEY = 'gisContent.layerFields.v1'

export type DashboardFieldType = 'string' | 'integer' | 'double' | 'date' | 'oid' | 'boolean'

export type DashboardDataSourceField = {
  name: string
  type: DashboardFieldType
  isKey?: boolean
}

export type DashboardDataSourceLayer = {
  id: string
  name: string
  fields: DashboardDataSourceField[]
}

export type AgroCloudDashboardDataSource = {
  id: string
  gisContentId: string
  title: string
  typeLabel: string
  layers: DashboardDataSourceLayer[]
}

export type DataSourceMappingDraft = {
  replacementGisContentId: string | null
  layerMapping: Record<string, string | null>
  fieldMapping: Record<string, Record<string, string | null>>
}

const SMART_AGRITECH_LAYERS: DashboardDataSourceLayer[] = [
  {
    id: 'agro-structures',
    name: 'Agro Structures',
    fields: [
      { name: 'OBJECTID', type: 'oid', isKey: true },
      { name: 'Farm_Code', type: 'string' },
      { name: 'ZONE_ID', type: 'string' },
      { name: 'Shape__Area', type: 'double' },
    ],
  },
  {
    id: 'agri-location',
    name: 'Agri_Location',
    fields: [
      { name: 'ObjectID', type: 'oid', isKey: true },
      { name: 'Subtype', type: 'integer' },
      { name: 'Name', type: 'string' },
      { name: 'Farm_Code', type: 'string' },
      { name: 'Status', type: 'string' },
      { name: 'Area_Ha', type: 'double' },
      { name: 'Last_Updated', type: 'date' },
    ],
  },
  {
    id: 'world-countries',
    name: 'World_Countries',
    fields: [
      { name: 'ObjectID', type: 'oid', isKey: true },
      { name: 'COUNTRY', type: 'string' },
      { name: 'ISO_A3', type: 'string' },
      { name: 'POP_EST', type: 'integer' },
    ],
  },
]

const FEATURE_LAYER_SCHEMAS: Record<string, DashboardDataSourceField[]> = {
  'Parcel boundaries': [
    { name: 'ObjectID', type: 'oid', isKey: true },
    { name: 'Farm_Code', type: 'string' },
    { name: 'Parcel_ID', type: 'string' },
    { name: 'Area_Ha', type: 'double' },
    { name: 'Zone_Name', type: 'string' },
  ],
  'Soil moisture — hosted': [
    { name: 'ObjectID', type: 'oid', isKey: true },
    { name: 'Sensor_ID', type: 'string' },
    { name: 'Moisture_pct', type: 'double' },
    { name: 'Reading_Date', type: 'date' },
    { name: 'Farm_Code', type: 'string' },
  ],
  'Greenhouse sensors layer': [
    { name: 'ObjectID', type: 'oid', isKey: true },
    { name: 'Sensor_Name', type: 'string' },
    { name: 'Temperature', type: 'double' },
    { name: 'Humidity', type: 'double' },
    { name: 'Farm_Code', type: 'string' },
  ],
}

function readStoredLayerFields(rowId: string): DashboardDataSourceField[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(GIS_CONTENT_FIELDS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Record<string, Array<{ name?: string; type?: string }>>
    const list = parsed[rowId]
    if (!Array.isArray(list)) return []
    return list
      .map(f => ({
        name: String(f?.name ?? '').trim(),
        type: normalizeFieldType(String(f?.type ?? 'string')),
      }))
      .filter(f => f.name)
  } catch {
    return []
  }
}

export function normalizeFieldType(raw: string): DashboardFieldType {
  const t = raw.toLowerCase()
  if (t === 'oid' || t === 'esrifieldtypeoid') return 'oid'
  if (t === 'integer' || t === 'int' || t === 'esrifieldtypeinteger' || t === 'small-integer') return 'integer'
  if (t === 'double' || t === 'float' || t === 'number' || t === 'esrifieldtypedouble') return 'double'
  if (t === 'date' || t === 'esrifieldtypedate') return 'date'
  if (t === 'boolean' || t === 'esrifieldtypeboolean') return 'boolean'
  return 'string'
}

function slugLayerId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

function isWebMapLike(row: GisContentRow): boolean {
  return row.type === 'web-map' || row.type === 'scene' || row.type === 'three-d-layer' || row.type === 'instant-app'
}

export function resolveDataSourceLayers(row: GisContentRow): DashboardDataSourceLayer[] {
  const stored = readStoredLayerFields(row.id)
  if (stored.length > 0) {
    return [{ id: slugLayerId(row.title), name: row.title, fields: stored }]
  }

  if (row.type === 'feature-layer') {
    const fields = FEATURE_LAYER_SCHEMAS[row.title] ?? [
      { name: 'ObjectID', type: 'oid' as const, isKey: true },
      { name: 'Farm_Code', type: 'string' as const },
      { name: 'Name', type: 'string' as const },
      { name: 'Area_Ha', type: 'double' as const },
    ]
    return [{ id: slugLayerId(row.title), name: row.title, fields }]
  }

  if (isWebMapLike(row)) {
    const titleLower = row.title.toLowerCase()
    if (
      titleLower.includes('irrigation') ||
      titleLower.includes('agri') ||
      titleLower.includes('training') ||
      titleLower.includes('weather') ||
      titleLower.includes('satellite')
    ) {
      return SMART_AGRITECH_LAYERS.map(l => ({ ...l, fields: [...l.fields] }))
    }
    return SMART_AGRITECH_LAYERS.map(l => ({ ...l, fields: [...l.fields] }))
  }

  return [
    {
      id: slugLayerId(row.title),
      name: row.title,
      fields: [
        { name: 'ObjectID', type: 'oid', isKey: true },
        { name: 'Name', type: 'string' },
        { name: 'Farm_Code', type: 'string' },
      ],
    },
  ]
}

/** Replacement schema comes from the selected GIS Content portal item (same resolver as current). */
export function resolveReplacementLayers(row: GisContentRow): DashboardDataSourceLayer[] {
  return resolveDataSourceLayers(row)
}

export function buildDashboardDataSource(gisContentId: string): AgroCloudDashboardDataSource | null {
  const row = getGisContentRowById(gisContentId)
  if (!row) return null
  return {
    id: `ds-${gisContentId}`,
    gisContentId,
    title: row.title,
    typeLabel: row.typeLabel,
    layers: resolveDataSourceLayers(row),
  }
}

export function collectDashboardDataSources(config: AgroCloudDashboardConfig): AgroCloudDashboardDataSource[] {
  const seen = new Set<string>()
  const out: AgroCloudDashboardDataSource[] = []

  const register = (gisContentId: string) => {
    if (seen.has(gisContentId)) return
    seen.add(gisContentId)
    const ds = buildDashboardDataSource(gisContentId)
    if (ds) out.push(ds)
  }

  for (const ds of config.dataSources ?? []) register(ds.gisContentId)
  for (const el of config.elements) {
    if (el.gisContentId) register(el.gisContentId)
  }
  return out
}

export function normalizeDashboardConfig(config: AgroCloudDashboardConfig): AgroCloudDashboardConfig {
  let next: AgroCloudDashboardConfig = ensureLayoutDefaults({
    ...config,
    dataSources: [...(config.dataSources ?? [])],
  })
  for (const el of config.elements) {
    if (!el.gisContentId) continue
    const row = getGisContentRowById(el.gisContentId)
    if (!row) continue
    const id = `ds-${row.id}`
    if (!next.dataSources!.some(ds => ds.gisContentId === row.id)) {
      next = {
        ...next,
        dataSources: [
          ...next.dataSources!,
          { id, gisContentId: row.id, title: row.title, typeLabel: row.typeLabel },
        ],
      }
    }
  }
  return { ...next, bodyLayout: resolveBodyLayout(next) ?? undefined }
}

export function countWidgetsUsingDataSource(config: AgroCloudDashboardConfig, gisContentId: string): number {
  return config.elements.filter(el => elementUsesDataSource(el, gisContentId)).length
}

function normalizeLayerName(name: string): string {
  return name.toLowerCase().replace(/[\s_()-]+/g, '')
}

export function areFieldTypesCompatible(source: DashboardFieldType, target: DashboardFieldType): boolean {
  if (source === target) return true
  if (source === 'oid' && (target === 'integer' || target === 'oid')) return true
  if (target === 'oid' && (source === 'integer' || source === 'oid')) return true
  if (source === 'integer' && target === 'double') return true
  if (source === 'double' && target === 'integer') return true
  return false
}

function layerSchemaOverlapScore(
  original: DashboardDataSourceLayer,
  candidate: DashboardDataSourceLayer,
): number {
  let score = 0
  for (const field of original.fields) {
    const match = candidate.fields.find(
      f => f.name.toLowerCase() === field.name.toLowerCase() && areFieldTypesCompatible(field.type, f.type),
    )
    if (match) score += 3
  }
  return score
}

export function findBestLayerMatch(
  originalName: string,
  originalLayer: DashboardDataSourceLayer | undefined,
  replacementLayers: DashboardDataSourceLayer[],
  usedReplacement = new Set<string>(),
): string | null {
  const norm = normalizeLayerName(originalName)
  const exact = replacementLayers.find(
    l => !usedReplacement.has(l.name) && normalizeLayerName(l.name) === norm,
  )
  if (exact) return exact.name

  const withoutNew = originalName.replace(/\s*\(new\)\s*/i, '').trim()
  const fuzzy = replacementLayers.find(l => {
    if (usedReplacement.has(l.name)) return false
    const rNorm = normalizeLayerName(l.name.replace(/\s*\(new\)\s*/i, ''))
    return rNorm === normalizeLayerName(withoutNew) || rNorm.includes(norm) || norm.includes(rNorm)
  })
  if (fuzzy) return fuzzy.name

  const available = replacementLayers.filter(l => !usedReplacement.has(l.name))
  if (available.length === 1) return available[0]!.name

  let best: { name: string; score: number } | null = null
  for (const layer of available) {
    const rNorm = normalizeLayerName(layer.name)
    let score = layerSchemaOverlapScore(originalLayer ?? { id: '', name: originalName, fields: [] }, layer)
    if (rNorm.startsWith(norm.slice(0, 4)) || norm.startsWith(rNorm.slice(0, 4))) score += 2
    const words = withoutNew.toLowerCase().split(/\s+/)
    for (const w of words) {
      if (w.length > 2 && layer.name.toLowerCase().includes(w)) score += 1
    }
    if (!best || score > best.score) best = { name: layer.name, score }
  }
  return best && best.score > 0 ? best.name : available[0]?.name ?? null
}

export function findBestFieldMatch(
  originalField: DashboardDataSourceField,
  replacementFields: DashboardDataSourceField[],
  usedFields = new Set<string>(),
): string | null {
  const exact = replacementFields.find(
    f => !usedFields.has(f.name) && f.name === originalField.name && areFieldTypesCompatible(originalField.type, f.type),
  )
  if (exact) return exact.name

  const ci = replacementFields.find(
    f =>
      !usedFields.has(f.name) &&
      f.name.toLowerCase() === originalField.name.toLowerCase() &&
      areFieldTypesCompatible(originalField.type, f.type),
  )
  if (ci) return ci.name

  const compatible = replacementFields.filter(
    f => !usedFields.has(f.name) && areFieldTypesCompatible(originalField.type, f.type),
  )
  return compatible[0]?.name ?? null
}

export function buildAutoDataSourceMapping(
  currentLayers: DashboardDataSourceLayer[],
  replacementLayers: DashboardDataSourceLayer[],
): DataSourceMappingDraft {
  const layerMapping: Record<string, string | null> = {}
  const fieldMapping: Record<string, Record<string, string | null>> = {}
  const usedLayers = new Set<string>()

  for (const layer of currentLayers) {
    const replacementLayerName = findBestLayerMatch(layer.name, layer, replacementLayers, usedLayers)
    layerMapping[layer.name] = replacementLayerName
    if (replacementLayerName) usedLayers.add(replacementLayerName)

    const replacementLayer = replacementLayers.find(l => l.name === replacementLayerName)
    fieldMapping[layer.name] = {}
    const usedFields = new Set<string>()
    for (const field of layer.fields) {
      fieldMapping[layer.name]![field.name] = replacementLayer
        ? findBestFieldMatch(field, replacementLayer.fields, usedFields)
        : null
      const mapped = fieldMapping[layer.name]![field.name]
      if (mapped) usedFields.add(mapped)
    }
  }

  return { replacementGisContentId: null, layerMapping, fieldMapping }
}

export function validateDataSourceMapping(
  currentLayers: DashboardDataSourceLayer[],
  replacementLayers: DashboardDataSourceLayer[],
  draft: DataSourceMappingDraft,
): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  if (!draft.replacementGisContentId) {
    errors.push('Select a replacement data source.')
    return { valid: false, errors }
  }

  for (const layer of currentLayers) {
    const targetLayerName = draft.layerMapping[layer.name]
    if (!targetLayerName) {
      errors.push(`Layer "${layer.name}" has no replacement.`)
      continue
    }
    const targetLayer = replacementLayers.find(l => l.name === targetLayerName)
    if (!targetLayer) {
      errors.push(`Replacement layer "${targetLayerName}" not found.`)
      continue
    }
    for (const field of layer.fields) {
      const targetFieldName = draft.fieldMapping[layer.name]?.[field.name]
      if (!targetFieldName) {
        errors.push(`Field "${field.name}" on "${layer.name}" has no replacement.`)
        continue
      }
      const targetField = targetLayer.fields.find(f => f.name === targetFieldName)
      if (!targetField) {
        errors.push(`Replacement field "${targetFieldName}" not found.`)
        continue
      }
      if (!areFieldTypesCompatible(field.type, targetField.type)) {
        errors.push(
          `Cannot map ${field.name} (${field.type}) to ${targetField.name} (${targetField.type}) — incompatible types.`,
        )
      }
    }
  }

  return { valid: errors.length === 0, errors }
}

const WIDGET_KINDS_USING_DATA_SOURCE: AgroCloudDashboardElement['kind'][] = [
  'map',
  'serial-chart',
  'pie-chart',
  'indicator',
  'gauge',
  'list',
  'table',
  'details',
]

export function widgetKindsUsingDataSource(): AgroCloudDashboardElement['kind'][] {
  return WIDGET_KINDS_USING_DATA_SOURCE
}

export function elementUsesDataSource(el: AgroCloudDashboardElement, gisContentId: string): boolean {
  if (el.gisContentId === gisContentId) return true
  return el.dataSourceId === `ds-${gisContentId}`
}

export function applyDataSourceReplacement(
  config: AgroCloudDashboardConfig,
  currentGisContentId: string,
  replacementRow: GisContentRow,
  draft: DataSourceMappingDraft,
): AgroCloudDashboardConfig {
  const newGisId = replacementRow.id
  const newDataSourceId = `ds-${newGisId}`

  const elements = config.elements.map(el => {
    if (!elementUsesDataSource(el, currentGisContentId)) return el

    const next: AgroCloudDashboardElement = { ...el }

    if (el.gisContentId === currentGisContentId) {
      next.gisContentId = newGisId
      next.gisContentType = replacementRow.type
      if (el.kind === 'map') next.label = replacementRow.title
    }

    if (el.dataSourceId === `ds-${currentGisContentId}` || el.gisContentId === currentGisContentId) {
      next.dataSourceId = newDataSourceId
    }

    if (el.sourceLayer) {
      const mappedLayer = draft.layerMapping[el.sourceLayer]
      if (mappedLayer) next.sourceLayer = mappedLayer
      if (el.field) {
        const mappedField = draft.fieldMapping[el.sourceLayer]?.[el.field]
        if (mappedField) next.field = mappedField
      }
    }

    return next
  })

  const dataSources = (config.dataSources ?? [])
    .filter(ds => ds.gisContentId !== currentGisContentId)
    .concat([
      {
        id: newDataSourceId,
        gisContentId: newGisId,
        title: replacementRow.title,
        typeLabel: replacementRow.typeLabel,
      },
    ])

  return { ...config, elements, dataSources }
}

export function fieldTypeIcon(type: DashboardFieldType): string {
  switch (type) {
    case 'oid':
      return 'fa-solid fa-key'
    case 'integer':
    case 'double':
      return 'fa-solid fa-hashtag'
    case 'date':
      return 'fa-regular fa-calendar'
    case 'boolean':
      return 'fa-regular fa-square-check'
    default:
      return 'fa-solid fa-font'
  }
}

export function fieldTypeLabel(type: DashboardFieldType): string {
  switch (type) {
    case 'oid':
      return 'Key'
    case 'integer':
      return 'Integer'
    case 'double':
      return 'Double'
    case 'date':
      return 'Date'
    case 'boolean':
      return 'Boolean'
    default:
      return 'String'
  }
}

export function dataSourceTypeBadge(row: GisContentRow): string {
  switch (row.type) {
    case 'web-map':
      return 'Web Map'
    case 'dashboard':
      return 'Dashboard'
    case 'storymap':
      return 'StoryMap'
    case 'feature-layer':
      return 'Feature Layer'
    case 'scene':
    case 'three-d-layer':
      return 'Web Scene'
    default:
      return gisContentPortalDisplayTypeLabel(row)
  }
}
