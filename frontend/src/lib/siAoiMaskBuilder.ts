/**
 * Optional AOI Mask Builder — dynamic layer / field / value filter for Sentinel Live clip + dataMask.
 * Default Agro_Structures Farm Plots + PIVOT mask remains when builder is disabled.
 */

import { featureToPrimaryAoiFeature, isAgroStructuresLayer, buildAgroStructuresLayerAoiMask } from './agroStructuresPrimaryAoi'
import { computeStableGisFeatureKey } from './gisFeatureStableKey'

export const SI_AOI_MASK_BUILDER_LS_KEY = 'si_aoi_mask_builder_v1'

export type SiAoiMaskMode = 'selected-features' | 'filtered-features' | 'entire-layer'

export type SiAoiMaskDisplayMode = 'clip-outside' | 'transparent-outside' | 'dim-outside'

export type SiAoiMaskBuilderSettings = {
  enabled: boolean
  sourceLayerId: string
  filterField: string
  filterValues: string[]
  sentinelLayerId: string
  maskMode: SiAoiMaskMode
  displayMode: SiAoiMaskDisplayMode
  liveUpdate: boolean
}

export type SiAoiMaskBuilderLayerOption = {
  id: string
  label: string
  featureCount: number
}

export const DEFAULT_SI_AOI_MASK_BUILDER_SETTINGS: SiAoiMaskBuilderSettings = {
  enabled: false,
  sourceLayerId: 'agro-structures-fs21',
  filterField: 'Structure_Type',
  filterValues: ['1006', '1007'],
  sentinelLayerId: '',
  /** UI Boundary "All features"; legacy `filtered-features` is coerced on normalize. */
  maskMode: 'entire-layer',
  displayMode: 'transparent-outside',
  liveUpdate: true,
}

export type SiAoiMaskBuilderLayerLike = {
  id?: string
  name?: string
  source?: string
  sourceUrl?: string
  visible?: boolean
  renderMode?: string
  geojson?: { features?: unknown[] }
  arcgisLayerDefinition?: {
    fields?: Array<{
      name?: string
      alias?: string
      domain?: {
        type?: string
        codedValues?: Array<{ name?: string; code?: number | string }>
      }
    }>
    types?: Array<{ id?: number | string; name?: string }>
    typeIdField?: string
  } | null
}

function readFeatureProperties(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {}
  const f = raw as Record<string, unknown>
  if (f.properties && typeof f.properties === 'object' && !Array.isArray(f.properties)) {
    return f.properties as Record<string, unknown>
  }
  if (f.attributes && typeof f.attributes === 'object' && !Array.isArray(f.attributes)) {
    return f.attributes as Record<string, unknown>
  }
  return {}
}

function formatFieldValueChoice(name: string, code: string | number): string {
  const id = String(code).trim()
  const label = String(name ?? id).trim()
  return label && label !== id ? `${label} (${id})` : id
}

function collectArcgisSchemaValueChoices(
  layer: SiAoiMaskBuilderLayerLike | null | undefined,
  field: string,
): string[] {
  const def = layer?.arcgisLayerDefinition
  if (!def || !field.trim()) return []

  if (def.typeIdField === field && Array.isArray(def.types)) {
    return def.types
      .map(t => formatFieldValueChoice(String(t.name ?? t.id ?? ''), t.id ?? ''))
      .filter(Boolean)
  }

  const fieldDef = Array.isArray(def.fields) ? def.fields.find(f => f?.name === field) : undefined
  const coded = fieldDef?.domain?.codedValues
  if (Array.isArray(coded) && coded.length) {
    return coded
      .map(cv => formatFieldValueChoice(String(cv.name ?? cv.code ?? ''), cv.code ?? ''))
      .filter(Boolean)
  }

  return []
}

export function layerNeedsAoiMaskFieldHydration(layer: SiAoiMaskBuilderLayerLike | null | undefined): boolean {
  if (!layer) return false
  const featureCount = Array.isArray(layer.geojson?.features) ? layer.geojson!.features!.length : 0
  if (!featureCount) return true
  return listSiAoiMaskBuilderFieldOptions(layer).length === 0
}

export function loadSiAoiMaskBuilderSettings(options?: { storageKey?: string }): SiAoiMaskBuilderSettings {
  const storageKey = options?.storageKey ?? SI_AOI_MASK_BUILDER_LS_KEY
  if (typeof window === 'undefined') return { ...DEFAULT_SI_AOI_MASK_BUILDER_SETTINGS }
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return { ...DEFAULT_SI_AOI_MASK_BUILDER_SETTINGS }
    const parsed = JSON.parse(raw) as Partial<SiAoiMaskBuilderSettings>
    return normalizeSiAoiMaskBuilderSettings(parsed)
  } catch {
    return { ...DEFAULT_SI_AOI_MASK_BUILDER_SETTINGS }
  }
}

export function persistSiAoiMaskBuilderSettings(
  settings: SiAoiMaskBuilderSettings,
  options?: { storageKey?: string },
): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  const storageKey = options?.storageKey ?? SI_AOI_MASK_BUILDER_LS_KEY
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(settings))
  } catch {
    /* ignore quota */
  }
}

export function normalizeSiAoiMaskBuilderSettings(
  partial: Partial<SiAoiMaskBuilderSettings>,
): SiAoiMaskBuilderSettings {
  // Boundary UI only exposes All features / Selected — coerce legacy filtered-features
  // so Agro Structure_Type defaults cannot empty-clip a plain AOI layer.
  const maskMode: SiAoiMaskMode =
    partial.maskMode === 'selected-features' ? 'selected-features' : 'entire-layer'
  const displayMode =
    partial.displayMode === 'clip-outside' ||
    partial.displayMode === 'transparent-outside' ||
    partial.displayMode === 'dim-outside'
      ? partial.displayMode
      : DEFAULT_SI_AOI_MASK_BUILDER_SETTINGS.displayMode
  return {
    enabled: Boolean(partial.enabled),
    sourceLayerId: String(partial.sourceLayerId ?? DEFAULT_SI_AOI_MASK_BUILDER_SETTINGS.sourceLayerId),
    filterField: String(partial.filterField ?? DEFAULT_SI_AOI_MASK_BUILDER_SETTINGS.filterField),
    filterValues: Array.isArray(partial.filterValues)
      ? partial.filterValues.map(v => String(v))
      : [...DEFAULT_SI_AOI_MASK_BUILDER_SETTINGS.filterValues],
    sentinelLayerId: String(partial.sentinelLayerId ?? ''),
    maskMode,
    displayMode,
    liveUpdate: partial.liveUpdate !== false,
  }
}

export function listSiAoiMaskBuilderLayerOptions(
  layers: SiAoiMaskBuilderLayerLike[],
): SiAoiMaskBuilderLayerOption[] {
  return layers
    .filter(l => {
      if (l.renderMode === 'raster') return false
      const n = Array.isArray(l.geojson?.features) ? l.geojson!.features!.length : 0
      return n > 0 && l.id
    })
    .map(l => ({
      id: String(l.id),
      label: String(l.name || l.id),
      featureCount: Array.isArray(l.geojson?.features) ? l.geojson!.features!.length : 0,
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

/** Vector custom layers usable as Sentinel clip AOI (includes viewport-streaming layers before tiles load). */
export function listSiAoiLayerModeOptions(
  layers: SiAoiMaskBuilderLayerLike[],
): SiAoiMaskBuilderLayerOption[] {
  return layers
    .filter(l => {
      if (l.renderMode === 'raster') return false
      if (!l.id) return false
      const n = Array.isArray(l.geojson?.features) ? l.geojson!.features!.length : 0
      if (n > 0) return true
      const metaN = Number((l as { importMetadata?: { featureCount?: number } }).importMetadata?.featureCount)
      if (Number.isFinite(metaN) && metaN > 0) return true
      return Boolean((l as { viewportStreaming?: boolean }).viewportStreaming)
    })
    .map(l => {
      const geoN = Array.isArray(l.geojson?.features) ? l.geojson!.features!.length : 0
      const metaN = Number((l as { importMetadata?: { featureCount?: number } }).importMetadata?.featureCount)
      const featureCount =
        Number.isFinite(metaN) && metaN > geoN ? Math.floor(metaN) : geoN
      return {
        id: String(l.id),
        label: String(l.name || l.id),
        featureCount,
      }
    })
    .sort((a, b) => a.label.localeCompare(b.label))
}

export function listSiAoiMaskBuilderFieldOptions(layer: SiAoiMaskBuilderLayerLike | null | undefined): string[] {
  if (!layer) return []
  const names = new Set<string>()
  const arcFields = layer.arcgisLayerDefinition?.fields
  if (Array.isArray(arcFields)) {
    for (const f of arcFields) {
      const n = String(f?.name ?? '').trim()
      if (n) names.add(n)
    }
  }
  const features = Array.isArray(layer.geojson?.features) ? layer.geojson!.features! : []
  const sampleStep = features.length > 400 ? Math.ceil(features.length / 400) : 1
  for (let i = 0; i < features.length; i += sampleStep) {
    const props = readFeatureProperties(features[i])
    for (const k of Object.keys(props)) {
      if (!k.startsWith('mapbox_') && !k.startsWith('Shape__')) names.add(k)
    }
  }
  if (names.size === 0 && isAgroStructuresLayer(layer)) {
    for (const f of AGRO_STRUCTURES_MASK_FIELD_FALLBACK) names.add(f)
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b))
}

export function listSiAoiMaskBuilderFieldLabels(
  layer: SiAoiMaskBuilderLayerLike | null | undefined,
): Array<{ name: string; label: string }> {
  const names = listSiAoiMaskBuilderFieldOptions(layer)
  const aliasByName = new Map<string, string>()
  for (const f of layer?.arcgisLayerDefinition?.fields ?? []) {
    const name = String(f?.name ?? '').trim()
    const alias = String(f?.alias ?? '').trim()
    if (name) aliasByName.set(name, alias || name)
  }
  return names.map(name => ({ name, label: aliasByName.get(name) ?? name }))
}

export function readFeatureFieldToken(props: Record<string, unknown>, field: string): string {
  const v = props[field] ?? props[field.toLowerCase()] ?? props[field.toUpperCase()]
  if (v == null || v === '') return ''
  return String(v).trim()
}

/** Unique display tokens for a field (code + label when ArcGIS subtype labels are known). */
export function listSiAoiMaskBuilderUniqueFieldValues(
  layer: SiAoiMaskBuilderLayerLike | null | undefined,
  field: string,
): string[] {
  if (!layer || !field.trim()) return []
  const merged = new Map<string, string>()

  for (const choice of collectArcgisSchemaValueChoices(layer, field)) {
    const token = parseFilterValueChoice(choice).pop() ?? choice
    merged.set(token, choice)
  }

  const features = Array.isArray(layer.geojson?.features) ? layer.geojson!.features! : []
  const sampleStep = features.length > 500 ? Math.ceil(features.length / 500) : 1
  for (let i = 0; i < features.length; i += sampleStep) {
    const props = readFeatureProperties(features[i])
    const token = readFeatureFieldToken(props, field)
    if (!token) continue
    const label = humanizeFieldValue(field, token, layer)
    merged.set(token, label && label !== token ? `${label} (${token})` : token)
  }

  if (merged.size === 0 && isAgroStructuresLayer(layer) && field === 'Structure_Type') {
    return ['PIVOT (1006)', 'Farm Plots (1007)']
  }

  return Array.from(merged.values()).sort((a, b) => a.localeCompare(b))
}

function humanizeFieldValue(
  field: string,
  token: string,
  layer?: SiAoiMaskBuilderLayerLike | null,
): string {
  const typeIdField = layer?.arcgisLayerDefinition?.typeIdField
  if (typeIdField === field && Array.isArray(layer?.arcgisLayerDefinition?.types)) {
    const num = Number(token)
    const hit = layer.arcgisLayerDefinition.types.find(t => Number(t.id) === num || String(t.id) === token)
    if (hit?.name) return String(hit.name)
  }
  if (field === 'Structure_Type') {
    if (token === '1006' || token === '1006.0') return 'PIVOT'
    if (token === '1007' || token === '1007.0') return 'Farm Plots'
  }
  return token
}

export function parseFilterValueChoice(choice: string): string[] {
  const trimmed = choice.trim()
  const paren = trimmed.match(/^(.+?)\s+\(([^)]+)\)\s*$/)
  if (paren) return [paren[2]!.trim(), paren[1]!.trim()]
  return [trimmed]
}

export function isSiAoiMaskFilterValueSelected(filterValues: string[], choice: string): boolean {
  const parts = parseFilterValueChoice(choice)
  return filterValues.some(v => v === choice || parts.includes(v))
}

export function featureMatchesAoiMaskFilterValues(
  props: Record<string, unknown>,
  field: string,
  filterValues: string[],
): boolean {
  if (!filterValues.length) return false
  const token = readFeatureFieldToken(props, field)
  if (!token) return false
  const label = humanizeFieldValue(field, token, undefined)
  const want = new Set<string>()
  for (const choice of filterValues) {
    for (const part of parseFilterValueChoice(choice)) want.add(part)
  }
  if (want.has(token) || want.has(label)) return true
  const num = Number(token)
  if (Number.isFinite(num)) {
    for (const w of want) {
      if (Number(w) === num) return true
    }
  }
  return false
}

const AGRO_STRUCTURES_MASK_FIELD_FALLBACK = [
  'Structure_Type',
  'Farm_Name',
  'Farm_Code',
  'OBJECTID',
  'GlobalID',
] as const

export function effectiveAoiMaskFilterValues(
  layer: SiAoiMaskBuilderLayerLike | null | undefined,
  settings: Pick<SiAoiMaskBuilderSettings, 'maskMode' | 'filterField' | 'filterValues'>,
): string[] {
  if (settings.maskMode !== 'filtered-features') return settings.filterValues
  if (settings.filterValues.length) return settings.filterValues
  if (
    isAgroStructuresLayer(layer) &&
    (settings.filterField === 'Structure_Type' || !settings.filterField.trim())
  ) {
    return [...DEFAULT_SI_AOI_MASK_BUILDER_SETTINGS.filterValues]
  }
  return settings.filterValues
}

export function resolveSiAoiMaskBuilderClipGeoJson(
  layer: SiAoiMaskBuilderLayerLike | null | undefined,
  settings: SiAoiMaskBuilderSettings,
  selectedFeatureKeys: Set<string>,
): { type: 'FeatureCollection'; features: unknown[] } | null {
  if (!settings.enabled || !layer) return null

  const filterValues = effectiveAoiMaskFilterValues(layer, settings)
  const filterField =
    settings.filterField.trim() ||
    (isAgroStructuresLayer(layer) ? 'Structure_Type' : settings.filterField)

  const mask = buildSiAoiMaskBuilderGeoJson(
    layer,
    {
      filterField,
      filterValues,
      maskMode: settings.maskMode,
    },
    selectedFeatureKeys,
  )
  if (mask?.features?.length) return mask

  if (isAgroStructuresLayer(layer)) {
    return buildAgroStructuresLayerAoiMask(layer.geojson ?? null)
  }

  if (settings.maskMode === 'entire-layer' && layer.geojson?.features?.length) {
    const features: unknown[] = []
    for (const raw of layer.geojson.features) {
      const aoi = featureToPrimaryAoiFeature(raw)
      if (aoi) features.push(aoi)
    }
    if (features.length) return { type: 'FeatureCollection', features }
  }

  return null
}

export function buildSiAoiMaskBuilderGeoJson(
  layer: SiAoiMaskBuilderLayerLike | null | undefined,
  settings: Pick<SiAoiMaskBuilderSettings, 'filterField' | 'filterValues' | 'maskMode'>,
  selectedFeatureKeys: Set<string>,
): { type: 'FeatureCollection'; features: unknown[] } | null {
  if (!layer?.geojson?.features?.length) return null
  const features = layer.geojson.features
  const out: unknown[] = []

  for (let i = 0; i < features.length; i++) {
    const raw = features[i]
    const props = readFeatureProperties(raw)

    let include = false
    if (settings.maskMode === 'entire-layer') {
      include = true
    } else if (settings.maskMode === 'selected-features') {
      const key = computeStableGisFeatureKey(raw, i)
      include = selectedFeatureKeys.has(key)
    } else {
      include = featureMatchesAoiMaskFilterValues(props, settings.filterField, settings.filterValues)
    }

    if (!include) continue
    const aoi = featureToPrimaryAoiFeature(raw)
    if (aoi) out.push(aoi)
  }

  if (!out.length) return null
  return { type: 'FeatureCollection', features: out }
}

export function siAoiMaskBuilderSignature(
  settings: SiAoiMaskBuilderSettings,
  mask: { features?: unknown[] } | null,
  selectedFeatureKeys: Set<string>,
): string {
  const feats = mask?.features ?? []
  let sig = `b:${settings.enabled ? 1 : 0}|${settings.sourceLayerId}|${settings.filterField}|${settings.maskMode}|${settings.displayMode}|${settings.sentinelLayerId}|v:${settings.filterValues.join(',')}|n:${feats.length}`
  if (settings.maskMode === 'selected-features') {
    sig += `|sel:${[...selectedFeatureKeys].sort().join(',')}`
  }
  for (let i = 0; i < Math.min(feats.length, 120); i++) {
    const props = (feats[i] as { properties?: Record<string, unknown> })?.properties ?? {}
    sig += `|${props.OBJECTID ?? props.GlobalID ?? i}`
  }
  return sig
}

export function siAoiMaskBuilderDisplayOpacityMultiplier(displayMode: SiAoiMaskDisplayMode): number {
  switch (displayMode) {
    case 'dim-outside':
      return 0.88
    case 'clip-outside':
    case 'transparent-outside':
    default:
      return 1
  }
}

export function siAoiMaskBuilderStatusLabel(
  settings: SiAoiMaskBuilderSettings,
  layerLabel: string,
  featureCount: number,
): string {
  if (!settings.enabled) return ''
  if (settings.maskMode === 'entire-layer') {
    return `AOI Mask Builder · ${layerLabel} (entire layer, ${featureCount})`
  }
  if (settings.maskMode === 'selected-features') {
    return `AOI Mask Builder · ${layerLabel} (${featureCount} selected)`
  }
  const vals = settings.filterValues.length
    ? settings.filterValues.map(v => parseFilterValueChoice(v)[0]).join(', ')
    : '—'
  return `AOI Mask Builder · ${layerLabel}.${settings.filterField} ∈ {${vals}} (${featureCount})`
}
