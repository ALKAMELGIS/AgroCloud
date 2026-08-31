/**
 * Map calculated intelligence model rows onto Example.xlsx attribute columns.
 */

import type { AgriObjectReportRow } from '../../pages/satellite/lib/timeSeriesReport/buildAgriculturalObjectIntelligenceModel'
import { NOT_AVAILABLE } from '../../pages/satellite/lib/timeSeriesReport/agriculturalObjectIntelligenceSchema'
import { normalizeHlsCropTypeName } from '../agriFieldBoundary/hlsCropTypeNormalize'
import type { ObjectAttributeFieldDef, ObjectAttributesSchema } from './objectAttributesSchema'
import { getObjectAttributesSchemaSync } from './objectAttributesSchema'

export type ObjectAttributesContext = {
  index: number
  periodDays: number
  sceneDate?: string | null
}

function isMissing(v: unknown): boolean {
  if (v == null || v === '') return true
  const s = String(v).trim()
  return s === NOT_AVAILABLE || s === '—' || s === '-' || /^n\/?a$/i.test(s)
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (isMissing(v)) return null
  const n = Number(String(v).replace(/[^\d.+-eE]/g, ''))
  return Number.isFinite(n) ? n : null
}

function str(v: unknown): string | null {
  if (isMissing(v)) return null
  return String(v).trim()
}

function round(n: number, d: number): number {
  const f = 10 ** d
  return Math.round(n * f) / f
}

function objectIdExample(index: number, existing?: string | null): string {
  const raw = (existing ?? '').trim()
  if (/^OBJ-\d+$/i.test(raw)) return raw.toUpperCase()
  return `OBJ-${String(index + 1).padStart(3, '0')}`
}

function objectTypeExample(row: AgriObjectReportRow): string {
  const t = str(row.objectType)
  if (t) {
    if (/greenhouse/i.test(t)) return 'Greenhouse'
    if (/farm/i.test(t)) return 'Farm'
    if (/field|plot|parcel/i.test(t)) return 'Field'
    return t.length <= 24 ? t : t.slice(0, 24)
  }
  return 'Field'
}

function landCoverExample(cover: string | null): string | null {
  if (!cover) return null
  if (/greenhouse/i.test(cover)) return 'Greenhouse'
  if (/bare/i.test(cover)) return 'Bare Soil'
  if (/cropland|vegetat|crop/i.test(cover)) return 'Cropland'
  if (/water|wetland/i.test(cover)) return 'Water'
  if (/fallow|sparse/i.test(cover)) return 'Bare Soil'
  return cover.length <= 32 ? cover : cover.slice(0, 32)
}

function healthStatusExample(health: string | null): string | null {
  if (!health) return null
  if (/healthy/i.test(health)) return 'Healthy'
  if (/moderate/i.test(health)) return 'Moderate Stress'
  if (/stress|high stress/i.test(health)) return 'Moderate Stress'
  if (/uncertain|unknown/i.test(health)) return 'Uncertain'
  return health
}

function waterStressExample(stress: string | null): string | null {
  if (!stress) return null
  const s = stress.toLowerCase()
  if (s === 'low') return 'Low'
  if (s === 'moderate') return 'Moderate'
  if (s === 'high') return 'High'
  if (/unknown|not available/i.test(stress)) return 'Unknown'
  return stress
}

function soilMoistPctFromNdmi(ndmi: number | null): number | null {
  if (ndmi == null) return null
  const pct = ((ndmi + 0.2) / 0.7) * 100
  return Math.max(0, Math.min(100, Math.round(pct)))
}

function soilMoistFromRow(row: AgriObjectReportRow): number | null {
  const ndmi = num(row.ndmi)
  const fromNdmi = soilMoistPctFromNdmi(ndmi)
  if (fromNdmi != null) return fromNdmi
  const raw = str(row.soilMoistureIndicator)
  if (!raw) return null
  if (/moist/i.test(raw)) return 40
  if (/moderate/i.test(raw)) return 25
  if (/low/i.test(raw)) return 12
  return null
}

function inspectPriExample(priority: string | null): string | null {
  if (!priority) return null
  const p = priority.toUpperCase()
  if (p === 'HIGH') return 'High'
  if (p === 'LOW' || p === 'NONE') return 'Low'
  if (p === 'MEDIUM') return 'Moderate'
  return priority
}

function changeExample(row: AgriObjectReportRow): string | number | null {
  const abandoned = str(row.newlyCultivatedAbandoned)
  if (abandoned && /abandon/i.test(abandoned)) return 'Abandoned'
  const delta = num(row.changeFromPreviousPeriod)
  if (delta != null) return round(delta, 2)
  const ch = str(row.changeFromPreviousPeriod)
  if (ch && !/insufficient|stable|improving|declining/i.test(ch)) return ch
  if (ch && /declin|abandon/i.test(ch)) return 'Abandoned'
  return null
}

function anomalyExample(row: AgriObjectReportRow, waterStress: string | null): string | null {
  if (waterStress === 'Moderate' || waterStress === 'High') return 'Water Stress'
  const raw = str(row.anomalyDetected)
  if (!raw || /no significant|none/i.test(raw)) return 'None'
  if (/water/i.test(raw)) return 'Water Stress'
  if (/vegetation|declin|loss|abandon/i.test(raw)) return 'Vegetation Loss'
  return 'None'
}

function activeStatusExample(row: AgriObjectReportRow, ndvi: number | null): string | null {
  const fromRow = str(row.activeStatus)
  if (fromRow) return /^active$/i.test(fromRow) ? 'Active' : /^inactive$/i.test(fromRow) ? 'Inactive' : fromRow
  if (ndvi != null && ndvi < 0.2) return 'Inactive'
  return 'Active'
}

function agriStatusExample(row: AgriObjectReportRow): string | null {
  const s = str(row.agriculturalStatus)
  if (!s) return null
  if (/non/i.test(s)) return 'Non-Agricultural'
  if (/agri/i.test(s)) return 'Agricultural'
  return s
}

function cropTypeExample(row: AgriObjectReportRow, ndvi: number | null): string | null {
  const c = str(row.cropType)
  if (c && !/insufficient sentinel|not available|unknown cover/i.test(c)) {
    const normalized = normalizeHlsCropTypeName(c)
    if (normalized) return normalized
  }
  const cover = str(row.landCoverType)
  if (cover && !/not available/i.test(cover)) return cover
  if (ndvi != null && ndvi < 0.2) return 'None'
  return null
}

function cropConfExample(row: AgriObjectReportRow, cropType: string | null): number | null {
  const c = num(row.cropTypeConfidencePct)
  if (c != null) return Math.round(c)
  if (cropType === 'None' || !cropType) return 0
  return null
}

function etMmDay(row: AgriObjectReportRow, periodDays: number): number | null {
  const total = num(row.actualEt)
  if (total == null || periodDays <= 0) return null
  return round(total / periodDays, 1)
}

function waterReqMmDay(row: AgriObjectReportRow, periodDays: number): number | null {
  const total = num(row.cropWaterRequirement)
  if (total == null || periodDays <= 0) return null
  return round(total / periodDays, 1)
}

function formatCell(
  field: ObjectAttributeFieldDef,
  value: string | number | null,
): string | number {
  if (value == null) return field.emptyValue
  if (field.type === 'number') {
    const n = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(n)) return field.emptyValue
    if (field.name === 'CROP_CONF' || field.name === 'SOIL_MOIST' || field.name === 'TOTAL_PROD') {
      return Math.round(n)
    }
    if (field.name === 'NDVI') return round(n, 2)
    if (field.name === 'AREA_HA') return round(n, 1)
    return round(n, 1)
  }
  const s = String(value).trim()
  return s || (field.emptyValue as string)
}

/** Build one Example.xlsx attribute row from a model output row. */
export function mapReportRowToObjectAttributes(
  row: AgriObjectReportRow,
  ctx: ObjectAttributesContext,
  schema?: ObjectAttributesSchema,
): Record<string, string | number> {
  const sch = schema ?? getObjectAttributesSchemaSync()
  const ndvi = num(row.ndvi)
  const cropType = cropTypeExample(row, ndvi)
  const waterStress = waterStressExample(str(row.waterStressIndicator))
  const areaHa = num(row.estimatedAreaHa)

  const computed: Record<string, string | number | null> = {
    OBJECT_ID: objectIdExample(ctx.index, str(row.objectId)),
    OBJECT_TYPE: objectTypeExample(row),
    OBJECT_NAME: str(row.objectName) ?? `Field ${ctx.index + 1}`,
    AREA_HA: areaHa,
    AGRI_STATUS: agriStatusExample(row),
    ACTIVE_STATUS: activeStatusExample(row, ndvi),
    LAND_COVER: landCoverExample(str(row.landCoverType)),
    CROP_TYPE: cropType,
    CROP_CONF: cropConfExample(row, cropType),
    HEALTH_STATUS: healthStatusExample(str(row.cropHealthStatus)),
    NDVI: ndvi,
    WATER_STRESS: waterStress,
    SOIL_MOIST: soilMoistFromRow(row),
    ET_MM_DAY: etMmDay(row, ctx.periodDays),
    WATER_REQ: waterReqMmDay(row, ctx.periodDays),
    EST_YIELD: num(row.estimatedYield),
    TOTAL_PROD: num(row.estimatedTotalProduction) != null ? Math.round(num(row.estimatedTotalProduction)!) : null,
    CHANGE: changeExample(row),
    ANOMALY: anomalyExample(row, waterStress),
    INSPECT_PRI: inspectPriExample(str(row.priorityForFieldInspection)),
  }

  const out: Record<string, string | number> = {}
  for (const field of sch.fields) {
    const raw = computed[field.name] ?? null
    out[field.name] = formatCell(field, raw)
  }
  return out
}
