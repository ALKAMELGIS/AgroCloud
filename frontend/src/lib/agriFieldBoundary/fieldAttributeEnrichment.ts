/**
 * Fill detected field polygons with the Agricultural Object Intelligence
 * attribute table (Sentinel-2 zonal statistics + Open-Meteo water proxies), so
 * "Add layer", GeoJSON and Shapefile all carry the same columns as the Excel
 * report instead of geometry with an area and a colour.
 */

import * as turf from '@turf/turf'

import type { CropAlertFieldInput } from '../siCropAlertEngine'
import {
  buildAgriculturalObjectIntelligenceModel,
  type AgriObjectIntelProgress,
  type AgriObjectReportRow,
} from '../../pages/satellite/lib/timeSeriesReport/buildAgriculturalObjectIntelligenceModel'
import {
  NOT_AVAILABLE,
  type AgriObjectFieldKey,
} from '../../pages/satellite/lib/timeSeriesReport/agriculturalObjectIntelligenceSchema'

/** Column the report itself does not carry — derived from the scene count. */
type DerivedFieldKey = 'dataCoverage'

export type FieldAttributeColumn = {
  key: AgriObjectFieldKey | DerivedFieldKey
  /** GeoJSON property name — the exact report column label. */
  prop: string
  /** DBF column — shapefiles cap field names at 10 ASCII characters. */
  dbf: string
  numeric?: boolean
}

/**
 * The Agricultural Object Intelligence Report columns, in report order and with
 * the report's own labels. Attribute tables and exports must line up with the
 * Excel deliverable column for column, so the label is the property name.
 */
export const FIELD_ATTRIBUTE_COLUMNS: FieldAttributeColumn[] = [
  { key: 'objectId', prop: 'Object ID', dbf: 'OBJECT_ID' },
  { key: 'objectType', prop: 'Object Type', dbf: 'OBJ_TYPE' },
  { key: 'objectName', prop: 'Object Name / Label', dbf: 'OBJ_NAME' },
  { key: 'boundaryCoordinates', prop: 'Boundary / Polygon Coordinates', dbf: 'BOUNDARY' },
  { key: 'centroidLatitude', prop: 'Centroid Latitude', dbf: 'CENT_LAT', numeric: true },
  { key: 'centroidLongitude', prop: 'Centroid Longitude', dbf: 'CENT_LON', numeric: true },
  { key: 'estimatedAreaHa', prop: 'Estimated Area (ha)', dbf: 'EST_AREAHA', numeric: true },
  { key: 'agriculturalStatus', prop: 'Agricultural / Non-Agricultural', dbf: 'AGRI_STAT' },
  { key: 'activeStatus', prop: 'Active / Inactive Status', dbf: 'ACTIVE_ST' },
  { key: 'landCoverType', prop: 'Land-Cover Type', dbf: 'LAND_COVER' },
  {
    key: 'treeVegetationCoveragePct',
    prop: 'Vegetation Coverage (%)',
    dbf: 'VEG_COVER',
    numeric: true,
  },
  { key: 'cropType', prop: 'Crop Type', dbf: 'CROP_TYPE' },
  { key: 'cropTypeConfidencePct', prop: 'Crop Confidence (%)', dbf: 'CROP_CONF', numeric: true },
  { key: 'cropGrowthStage', prop: 'Crop Growth Stage', dbf: 'CROP_STAGE' },
  { key: 'cropHealthStatus', prop: 'Crop Health', dbf: 'CROP_HLTH' },
  { key: 'ndvi', prop: 'NDVI', dbf: 'NDVI', numeric: true },
  { key: 'ndre', prop: 'NDRE', dbf: 'NDRE', numeric: true },
  { key: 'ndmi', prop: 'NDMI', dbf: 'NDMI', numeric: true },
  { key: 'waterStressIndicator', prop: 'Water Stress', dbf: 'WATR_STRS' },
  { key: 'soilMoistureIndicator', prop: 'Soil Moisture Proxy', dbf: 'SOIL_MOIST' },
  { key: 'actualEt', prop: 'Actual ET (ETa)', dbf: 'ACTUAL_ET' },
  { key: 'cropWaterRequirement', prop: 'Crop Water Requirement (ETc)', dbf: 'CROP_WREQ' },
  { key: 'irrigationPerformance', prop: 'Irrigation Performance', dbf: 'IRRIG_PERF' },
  { key: 'estimatedWaterUse', prop: 'Estimated Water Use', dbf: 'WATER_USE' },
  { key: 'waterProductivity', prop: 'Water Productivity', dbf: 'WATER_PROD' },
  { key: 'soilSalinityIndicator', prop: 'Soil-Salinity Indicator', dbf: 'SOIL_SALIN' },
  { key: 'landDegradationIndicator', prop: 'Land-Degradation Indicator', dbf: 'LAND_DEGR' },
  { key: 'landCropSuitability', prop: 'Land / Crop Suitability', dbf: 'SUITABLE' },
  { key: 'estimatedYield', prop: 'Estimated Yield', dbf: 'EST_YIELD' },
  { key: 'estimatedTotalProduction', prop: 'Estimated Total Production', dbf: 'TOTAL_PROD' },
  { key: 'yieldProductionConfidence', prop: 'Yield / Production Confidence', dbf: 'YIELD_CONF' },
  { key: 'changeFromPreviousPeriod', prop: 'Change from Previous Period', dbf: 'CHANGE_PRV' },
  { key: 'newlyCultivatedAbandoned', prop: 'Newly Cultivated / Abandoned', dbf: 'CULT_CHG' },
  { key: 'anomalyDetected', prop: 'Anomaly Detected', dbf: 'ANOMALY' },
  { key: 'priorityForFieldInspection', prop: 'Priority for Field Inspection', dbf: 'INSP_PRIO' },
  { key: 'recommendedActionInsight', prop: 'Recommended Action / Insight', dbf: 'RECOMMEND' },
  { key: 'timeSeriesDataAvailable', prop: 'Time-Series Data Available', dbf: 'TS_AVAIL' },
  {
    key: 'aiAnalyticalMethodUsed',
    prop: 'AI / Analytical Method Used (see Note)',
    dbf: 'AI_METHOD',
  },
  { key: 'capabilityStatus', prop: 'Capability Status', dbf: 'CAPABILITY' },
  { key: 'expectedAccuracy', prop: 'Expected Accuracy', dbf: 'EXP_ACCUR' },
  { key: 'dataCoverage', prop: 'Data Coverage', dbf: 'DATA_COVER' },
  {
    key: 'additionalObservationsRecommendations',
    prop: 'Additional Observations / Recommendations',
    dbf: 'OBSERV',
  },
]

/** Scenes below this leave change detection and phenology unreliable. */
const SPARSE_SCENE_COUNT = 5

/**
 * Full Sentinel-2 Layer index set returned by the multi-index Statistical API
 * evalscript. Passing the complete list keeps the report Layer-index label
 * honest and ensures NDVI / NDRE / NDMI (and derived water / cover fields) are
 * filled from the same zonal pull.
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

/**
 * "Data Coverage" is a report column with no model field: the builder folds the
 * usable scene count into the time-series cell, e.g. "Yes (15 Sentinel-2
 * scenes, …)", so the classification is read back out of it.
 */
function dataCoverageOf(timeSeriesCell: string | number | undefined): string {
  const text = String(timeSeriesCell ?? '')
  const scenes = Number(
    text.match(/(\d+)\s+Sentinel-2\s+scenes?/i)?.[1] ?? text.match(/^Yes\s*\((\d+)\)/i)?.[1],
  )
  if (!Number.isFinite(scenes)) {
    if (/^Limited/i.test(text.trim())) return 'Sparse / single-date coverage'
    return 'Sparse / single-date coverage'
  }
  return scenes >= SPARSE_SCENE_COUNT
    ? 'Standard multi-scene coverage'
    : 'Sparse / single-date coverage'
}

/** Marks a collection whose parcels already carry the attribute table. */
export const FIELD_ATTRIBUTES_STAMP = 'attributes_source'

export type EnrichFieldAttributesOptions = {
  /** Analysis window for the zonal statistics (YYYY-MM-DD). */
  fromDate: string
  toDate: string
  layerName?: string
  layerIds?: string[]
  signal?: AbortSignal
  onProgress?: (p: AgriObjectIntelProgress) => void
}

export function hasFieldAttributes(fc: GeoJSON.FeatureCollection | null | undefined): boolean {
  const first = fc?.features?.[0]?.properties as Record<string, unknown> | undefined
  return Boolean(first && first[FIELD_ATTRIBUTES_STAMP])
}

/**
 * True when the table was stamped but Sentinel returned no usable scenes
 * (e.g. a 1-day Image-date window). Callers should re-run enrichment with a
 * wider Layer-index window instead of keeping placeholder cells.
 */
export function fieldAttributesNeedRefresh(
  fc: GeoJSON.FeatureCollection | null | undefined,
): boolean {
  if (!hasFieldAttributes(fc)) return true
  const first = fc?.features?.[0]?.properties as Record<string, unknown> | undefined
  if (!first) return true
  const ts = String(first['Time-Series Data Available'] ?? '').trim()
  if (!ts || /^No$/i.test(ts)) return true
  return false
}

function fieldKeyOf(index: number): string {
  return `afb-${index + 1}`
}

/** Drop prior report stamps so Layer-index values are never blocked by placeholder 0 / NA. */
function stripReportProps(feature: GeoJSON.Feature): GeoJSON.Feature {
  const props = { ...(feature.properties || {}) } as Record<string, unknown>
  for (const col of FIELD_ATTRIBUTE_COLUMNS) {
    delete props[col.prop]
  }
  delete props[FIELD_ATTRIBUTES_STAMP]
  delete props.attributes_period
  return { ...feature, properties: props }
}

function centroidOf(feature: GeoJSON.Feature): [number, number] | null {
  try {
    const c = turf.centerOfMass(feature as any)?.geometry?.coordinates
    if (!Array.isArray(c) || c.length < 2) return null
    const lon = Number(c[0])
    const lat = Number(c[1])
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null
    return [lon, lat]
  } catch {
    return null
  }
}

/** Numeric cells arrive as text such as "0.49" or "57.5" — keep them numbers. */
function coerce(value: string | number | undefined, numeric?: boolean): string | number | null {
  if (value == null || value === '') return null
  if (!numeric) return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const text = String(value).trim()
  // Never turn "Not Available" into 0 via Number('') after stripping letters.
  if (!text || text === NOT_AVAILABLE || /^n\/?a$/i.test(text) || text === '—' || text === '-') {
    return null
  }
  const cleaned = text.replace(/[^\d.+-eE]/g, '')
  if (!cleaned || cleaned === '+' || cleaned === '-' || cleaned === '.' || cleaned === '+.' || cleaned === '-.') {
    return null
  }
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : text
}

function stampRow(
  feature: GeoJSON.Feature,
  row: AgriObjectReportRow | undefined,
  meta: { fromDate: string; toDate: string },
): GeoJSON.Feature {
  if (!row) return feature
  // Report columns are written first and in report order: attribute tables and
  // GeoJSON readers follow key order, so this is what puts them on screen in
  // the same sequence as the Excel deliverable.
  const props: Record<string, unknown> = {}
  for (const col of FIELD_ATTRIBUTE_COLUMNS) {
    const raw =
      col.key === 'dataCoverage' ? dataCoverageOf(row.timeSeriesDataAvailable) : row[col.key]
    const value = coerce(raw, col.numeric)
    props[col.prop] = value ?? NOT_AVAILABLE
  }
  // Detection internals (area_ha, footprint_method, styling…) trail the report
  // columns — the panel, the map style and the shapefile still read them.
  for (const [key, value] of Object.entries(feature.properties || {})) {
    if (!(key in props)) props[key] = value
  }
  props[FIELD_ATTRIBUTES_STAMP] = 'Sentinel-2 zonal statistics + Open-Meteo'
  props.attributes_period = `${meta.fromDate} → ${meta.toDate}`
  return { ...feature, properties: props }
}

/**
 * Run the intelligence model over detected parcels and stamp its row values
 * onto each feature. Parcels the model could not answer keep their geometry and
 * existing properties rather than gaining empty columns.
 */
export async function enrichFieldAttributesFromSentinel2(
  fc: GeoJSON.FeatureCollection,
  opts: EnrichFieldAttributesOptions,
): Promise<GeoJSON.FeatureCollection> {
  const features = (fc?.features || []).filter(
    f => f?.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'),
  )
  if (!features.length) return fc

  const plots: CropAlertFieldInput[] = []
  const sourceFeatures: Array<{
    fieldKey: string
    feature: GeoJSON.Feature
    original: GeoJSON.Feature
  }> = []
  features.forEach((feature, index) => {
    const centroid = centroidOf(feature)
    if (!centroid) return
    const fieldKey = fieldKeyOf(index)
    const cleaned = stripReportProps(feature)
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
    sourceFeatures.push({ fieldKey, feature: cleaned, original: feature })
  })
  if (!plots.length) return fc

  const model = await buildAgriculturalObjectIntelligenceModel({
    plots,
    features: sourceFeatures.map(s => ({ fieldKey: s.fieldKey, feature: s.feature })),
    layerName: opts.layerName || 'Detected field boundaries',
    fromDate: opts.fromDate,
    toDate: opts.toDate,
    layerIds: opts.layerIds?.length ? opts.layerIds : [...FIELD_ATTRIBUTE_LAYER_IDS],
    signal: opts.signal,
    onProgress: opts.onProgress,
  })

  const rowByKey = new Map(model.objects.map(row => [row.fieldKey, row]))
  const keyByOriginal = new Map(sourceFeatures.map(s => [s.original, s.fieldKey]))
  return {
    ...fc,
    features: (fc.features || []).map(f => {
      const key = keyByOriginal.get(f)
      return key ? stampRow(stripReportProps(f), rowByKey.get(key), opts) : f
    }),
  }
}

/** Default analysis window: the season leading up to the imagery date. */
export function defaultAttributeWindow(sceneDate?: string | null): {
  fromDate: string
  toDate: string
} {
  const end = sceneDate && /^\d{4}-\d{2}-\d{2}/.test(sceneDate) ? new Date(sceneDate) : new Date()
  const start = new Date(end.getTime() - 90 * 24 * 3600 * 1000)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  return { fromDate: iso(start), toDate: iso(end) }
}
