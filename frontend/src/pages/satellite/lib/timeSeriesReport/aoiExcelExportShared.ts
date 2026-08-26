/** Shared helpers for AOI Excel exports — date alignment, plot IDs, Excel-safe text. */

import { readFeatureFieldToken } from '../../../../lib/siAoiMaskBuilder'
import type { SiImageryObjectSourceFeature } from '../../utils/siImageryTimeSeriesFields'
import { SI_IMAGERY_PLOT_LABEL_AUTO } from '../../utils/siImageryTimeSeriesFields'

export const AOI_EXCEL_NO_DATA = 'No Data'

/** ASCII-safe placeholders so Windows Excel never shows mojibake (â€”, mÂ², …). */
export function excelSafeText(value: unknown): string {
  if (value == null) return AOI_EXCEL_NO_DATA
  return String(value)
    .replace(/\u2014|\u2013|\u2212/g, '-') // em/en/minus dashes
    .replace(/\u00A0/g, ' ') // nbsp
    .replace(/m\u00B2/gi, 'm2')
    .replace(/m²/gi, 'm2')
    .replace(/ha\u00B2/gi, 'ha')
    .replace(/\u2026/g, '...')
    .replace(/[^\S\n]+/g, ' ')
    .trim()
}

export function excelMissing(value: number | null | undefined): number | typeof AOI_EXCEL_NO_DATA {
  if (value == null || !Number.isFinite(value)) return AOI_EXCEL_NO_DATA
  return value
}

/** True when a label looks like an upload filename / layer system id, not a plot name. */
export function looksLikeLayerFileId(value: string): boolean {
  const s = String(value || '').trim()
  if (!s) return true
  if (/\.(zip|shp|dbf|shx|kml|kmz|geojson|json|gpkg|tif|tiff)$/i.test(s)) return true
  if (/^custom-\d+/i.test(s)) return true
  if (/^vl:/i.test(s)) return true
  return false
}

/** Strip common AOI layer prefixes for cleaner Plot_T-32 sheet / column names. */
export function cleanAoiPlotDisplayId(raw: string): string {
  let s = String(raw || '').trim()
  s = s.replace(/^AOI\s*:\s*/i, '')
  const colon = s.indexOf(':')
  if (colon > 0 && colon < 40) {
    s = s.slice(colon + 1).trim()
  }
  if (looksLikeLayerFileId(s)) {
    const hash = s.match(/#\s*(\d+)\s*$/)
    if (hash) return `Plot ${hash[1]}`
    const tail = s.match(/-(\d+)\s*$/)
    if (tail && !/\.zip/i.test(tail[0])) return `Plot ${tail[1]}`
    return 'Plot'
  }
  return s || 'Plot'
}

/** Resolve Plot Label display name (farmName after Field Selector labeling). */
export function resolveBatchPlotDisplayName(plot: {
  farmName?: string | null
  objectId?: string | null
}): string {
  const name = cleanAoiPlotDisplayId(String(plot.farmName || '').trim())
  if (name && !looksLikeLayerFileId(name)) return name
  const oid = cleanAoiPlotDisplayId(String(plot.objectId || '').trim())
  if (oid && !looksLikeLayerFileId(oid)) return oid
  return 'Plot'
}

/** Excel filename stem from the Plot Label dropdown (Field_Name, Field_ID, …). */
export function resolveBatchPlotExcelFilename(
  plot: {
    farmName?: string | null
    objectId?: string | null
    fieldKey?: string
  },
  options?: {
    plotNameField?: string
    objectLayerFeatures?: SiImageryObjectSourceFeature[]
  },
): string {
  const props = plotFeatureProperties(plot.fieldKey, options?.objectLayerFeatures)
  const plotNameField = String(options?.plotNameField ?? '').trim()

  if (plotNameField && plotNameField !== SI_IMAGERY_PLOT_LABEL_AUTO && props) {
    const token = readPlotAttributeToken(props, plotNameField)
    if (token) return token
  }

  const fieldName = readPlotAttributeToken(props, FIELD_NAME_ATTR_KEYS)
  if (fieldName) return fieldName

  return resolveBatchPlotDisplayName(plot)
}

const FIELD_ID_ATTR_KEYS = ['Field_ID', 'FIELD_ID', 'FieldID', 'FIELDID', 'Plot_ID', 'PLOT_ID'] as const
const FIELD_NAME_ATTR_KEYS = ['Field_Name', 'FIELD_NAME', 'FieldName', 'NAME', 'Name'] as const

function plotFeatureProperties(
  fieldKey: string | undefined,
  features: SiImageryObjectSourceFeature[] | undefined,
): Record<string, unknown> | undefined {
  if (!fieldKey || !features?.length) return undefined
  const feature = features.find(item => item.fieldKey === fieldKey)
  return feature?.feature.properties as Record<string, unknown> | undefined
}

function readPlotAttributeToken(
  props: Record<string, unknown> | undefined,
  keys: string | readonly string[],
): string {
  if (!props) return ''
  const aliases = typeof keys === 'string' ? [keys] : [...keys]
  for (const key of aliases) {
    const token = readFeatureFieldToken(props, key)
    if (token && !looksLikeLayerFileId(token)) {
      return cleanAoiPlotDisplayId(token)
    }
  }
  return ''
}

/** Resolve GIS Field_ID for duplicate filename disambiguation (e.g. 501a_2). */
export function resolveBatchPlotFieldId(
  plot: { fieldKey?: string; objectId?: string | null },
  objectLayerFeatures?: SiImageryObjectSourceFeature[],
): string {
  const fromProps = readPlotAttributeToken(
    plotFeatureProperties(plot.fieldKey, objectLayerFeatures),
    FIELD_ID_ATTR_KEYS,
  )
  if (fromProps) return fromProps
  const oid = cleanAoiPlotDisplayId(String(plot.objectId || '').trim())
  return oid && !looksLikeLayerFileId(oid) ? oid : ''
}

function compositeBatchPlotFilenameStem(fieldId: string, fieldName: string): string {
  const idPart = fieldId.replace(/\s+/g, '_').trim()
  const namePart = fieldName.replace(/\s+/g, '_').trim()
  if (idPart && namePart && idPart.toLowerCase() !== namePart.toLowerCase()) {
    return `${idPart}_${namePart}`
  }
  return idPart || namePart
}

/**
 * Unique `.xlsx` basename per plot — Field_Name by default; Field_ID prefix on duplicates
 * (reference pattern: 501a_2_KL-0231.xlsx).
 */
export function uniqueBatchPlotExcelFilename(
  plot: {
    farmName?: string | null
    objectId?: string | null
    fieldKey?: string
  },
  used: Set<string>,
  options?: {
    plotNameField?: string
    objectLayerFeatures?: SiImageryObjectSourceFeature[]
    sanitize?: (stem: string) => string
  },
): string {
  const sanitize =
    options?.sanitize ??
    ((stem: string) => {
      const safe = stem
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^[_.\s]+|[_.\s]+$/g, '')
        .trim()
      return safe || 'Plot'
    })

  const props = plotFeatureProperties(plot.fieldKey, options?.objectLayerFeatures)
  const fieldId = resolveBatchPlotFieldId(plot, options?.objectLayerFeatures)
  const fieldName =
    readPlotAttributeToken(props, FIELD_NAME_ATTR_KEYS) ||
    resolveBatchPlotExcelFilename(plot, options)

  const primaryStem = resolveBatchPlotExcelFilename(plot, options)

  const reserve = (stem: string): string => {
    const filename = `${sanitize(stem)}.xlsx`
    const key = filename.toLowerCase()
    if (used.has(key)) return ''
    used.add(key)
    return filename
  }

  let filename = reserve(primaryStem)
  if (filename) return filename

  if (fieldId) {
    filename = reserve(compositeBatchPlotFilenameStem(fieldId, fieldName))
    if (filename) return filename
    filename = reserve(fieldId)
    if (filename) return filename
  }

  let n = 2
  while (n < 1000) {
    filename = reserve(`${primaryStem}_${n}`)
    if (filename) return filename
    n += 1
  }
  filename = `${sanitize(primaryStem || fieldId || 'Plot')}_${Date.now()}.xlsx`
  used.add(filename.toLowerCase())
  return filename
}

/**
 * Union of all acquisition dates that have at least one finite index on any plot.
 * Every plot sheet must use this same list (missing → "No Data").
 */
export function collectMasterAcquisitionDates(
  dailyByPlot: Iterable<Array<{ date?: string; [k: string]: unknown }>>,
  fromDate: string,
  toDate: string,
  hasFiniteObservation: (row: { date?: string; [k: string]: unknown }) => boolean,
): string[] {
  const from = fromDate.slice(0, 10)
  const to = toDate.slice(0, 10)
  const set = new Set<string>()
  for (const rows of dailyByPlot) {
    for (const row of rows) {
      const d = String(row.date || '').trim().slice(0, 10)
      if (!d || d < from || d > to) continue
      if (hasFiniteObservation(row)) set.add(d)
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b))
}
