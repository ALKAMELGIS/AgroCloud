import { readFeatureFieldToken } from '../../../../lib/siAoiMaskBuilder'
import type { CropAlertFieldInput } from '../../../../lib/siCropAlertEngine'
import type { SiImageryObjectSourceFeature } from '../../utils/siImageryTimeSeriesFields'

export const PLOT_LAYER_ATTR_EMPTY = '—'

export type PlotLayerAttributes = {
  fieldId: string
  fieldName: string
  cropType: string
  irrigationType: string
}

const FIELD_ID_ALIASES = ['Field_ID', 'FieldID', 'FIELD_ID', 'Plot_ID', 'PLOT_ID'] as const
const FIELD_NAME_ALIASES = ['Field_Name', 'FieldName', 'FIELD_NAME', 'Name', 'NAME'] as const
const CROP_TYPE_ALIASES = ['Crop_Type', 'CropType', 'CROP_TYPE', 'cropType', 'crop'] as const
const IRRIGATION_ALIASES = ['Irrigation', 'IRRIGATION', 'irrigation'] as const

const PLACEHOLDER_VALUES = new Set([
  '',
  '-',
  '—',
  'n/a',
  'na',
  'none',
  'null',
  'not available',
  'not_available',
  'unknown',
])

function normalizePropKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, '').toLowerCase()
}

function isPlaceholderValue(raw: string): boolean {
  const token = String(raw ?? '').trim()
  if (!token) return true
  return PLACEHOLDER_VALUES.has(token.toLowerCase())
}

function cleanAttributeValue(raw: unknown): string {
  const token = raw == null ? '' : String(raw).trim()
  if (isPlaceholderValue(token)) return ''
  return token
}

function findPropertyValue(
  props: Record<string, unknown>,
  aliases: readonly string[],
): string {
  for (const key of aliases) {
    const token = cleanAttributeValue(readFeatureFieldToken(props, key))
    if (token) return token
  }
  const want = new Set(aliases.map(normalizePropKey))
  for (const [key, raw] of Object.entries(props)) {
    if (key.startsWith('__')) continue
    if (!want.has(normalizePropKey(key))) continue
    const token = cleanAttributeValue(raw)
    if (token) return token
  }
  return ''
}

export function readPlotLayerAttributesFromProps(
  props: Record<string, unknown> | null | undefined,
): PlotLayerAttributes {
  if (!props) {
    return {
      fieldId: PLOT_LAYER_ATTR_EMPTY,
      fieldName: PLOT_LAYER_ATTR_EMPTY,
      cropType: PLOT_LAYER_ATTR_EMPTY,
      irrigationType: PLOT_LAYER_ATTR_EMPTY,
    }
  }
  return {
    fieldId: findPropertyValue(props, FIELD_ID_ALIASES) || PLOT_LAYER_ATTR_EMPTY,
    fieldName: findPropertyValue(props, FIELD_NAME_ALIASES) || PLOT_LAYER_ATTR_EMPTY,
    cropType: findPropertyValue(props, CROP_TYPE_ALIASES) || PLOT_LAYER_ATTR_EMPTY,
    irrigationType: findPropertyValue(props, IRRIGATION_ALIASES) || PLOT_LAYER_ATTR_EMPTY,
  }
}

export function buildPlotLayerAttributesMap(
  features: SiImageryObjectSourceFeature[] | undefined,
): Map<string, PlotLayerAttributes> {
  const map = new Map<string, PlotLayerAttributes>()
  for (const item of features ?? []) {
    const props = (item.feature.properties ?? {}) as Record<string, unknown>
    map.set(item.fieldKey, readPlotLayerAttributesFromProps(props))
  }
  return map
}

export function mergePlotLayerAttributes(
  plot: CropAlertFieldInput,
  fromMap?: PlotLayerAttributes | null,
): PlotLayerAttributes {
  const fallback = readPlotLayerAttributesFromProps(plot as unknown as Record<string, unknown>)
  if (!fromMap) return fallback
  return {
    fieldId:
      fromMap.fieldId !== PLOT_LAYER_ATTR_EMPTY ? fromMap.fieldId : fallback.fieldId,
    fieldName:
      fromMap.fieldName !== PLOT_LAYER_ATTR_EMPTY ? fromMap.fieldName : fallback.fieldName,
    cropType:
      fromMap.cropType !== PLOT_LAYER_ATTR_EMPTY ? fromMap.cropType : fallback.cropType,
    irrigationType:
      fromMap.irrigationType !== PLOT_LAYER_ATTR_EMPTY
        ? fromMap.irrigationType
        : fallback.irrigationType,
  }
}

/** Resolve GIS attributes for export — prefers full GeoJSON feature properties. */
export function resolvePlotLayerAttributesForExport(
  plot: CropAlertFieldInput,
  objectLayerFeatures?: SiImageryObjectSourceFeature[],
  fromMap?: PlotLayerAttributes | null,
): PlotLayerAttributes {
  const feature = objectLayerFeatures?.find(item => item.fieldKey === plot.fieldKey)
  const fromFeature = feature
    ? readPlotLayerAttributesFromProps(feature.feature.properties as Record<string, unknown>)
    : null
  const merged = mergePlotLayerAttributes(plot, fromMap ?? fromFeature)
  if (
    merged.fieldId === PLOT_LAYER_ATTR_EMPTY &&
    merged.fieldName === PLOT_LAYER_ATTR_EMPTY &&
    merged.cropType === PLOT_LAYER_ATTR_EMPTY &&
    merged.irrigationType === PLOT_LAYER_ATTR_EMPTY &&
    fromFeature
  ) {
    return fromFeature
  }
  return merged
}

function isSyntheticPlotId(value: string): boolean {
  return /^Plot_\d+$/i.test(value.trim())
}

/** Field ID column — GIS Field_ID when present, else plot/object id. */
export function resolveExportFieldId(
  attrs: PlotLayerAttributes,
  plotObjectId: string,
): string {
  if (attrs.fieldId !== PLOT_LAYER_ATTR_EMPTY) return attrs.fieldId
  const oid = String(plotObjectId || '').trim()
  return oid || PLOT_LAYER_ATTR_EMPTY
}

/**
 * Field Name column — original Field_Name; when absent use descriptive Field_ID
 * (e.g. "503 - KL-233S"); else plot label from the map.
 */
export function resolveExportFieldName(
  attrs: PlotLayerAttributes,
  plotLabel: string,
  plotObjectId: string,
): string {
  if (attrs.fieldName !== PLOT_LAYER_ATTR_EMPTY) return attrs.fieldName
  if (
    attrs.fieldId !== PLOT_LAYER_ATTR_EMPTY &&
    !isSyntheticPlotId(attrs.fieldId) &&
    attrs.fieldId !== plotObjectId
  ) {
    return attrs.fieldId
  }
  if (
    attrs.fieldId !== PLOT_LAYER_ATTR_EMPTY &&
    attrs.fieldName === PLOT_LAYER_ATTR_EMPTY &&
    !isSyntheticPlotId(attrs.fieldId)
  ) {
    return attrs.fieldId
  }
  const label = String(plotLabel || '').trim()
  if (label && !isSyntheticPlotId(label)) return label
  if (attrs.fieldId !== PLOT_LAYER_ATTR_EMPTY) return attrs.fieldId
  return label || plotObjectId || PLOT_LAYER_ATTR_EMPTY
}

export function resolveExportCropType(
  attrs: PlotLayerAttributes,
  fallbackCrop: string,
): string {
  if (attrs.cropType !== PLOT_LAYER_ATTR_EMPTY) return attrs.cropType
  const crop = String(fallbackCrop || '').trim()
  return crop && !isPlaceholderValue(crop) ? crop : PLOT_LAYER_ATTR_EMPTY
}

export function resolveExportIrrigationType(attrs: PlotLayerAttributes): string {
  return attrs.irrigationType !== PLOT_LAYER_ATTR_EMPTY ? attrs.irrigationType : PLOT_LAYER_ATTR_EMPTY
}
