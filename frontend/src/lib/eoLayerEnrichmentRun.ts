/**
 * Client-side EO layer enrichment — mirrors Python eo_enrichment formulas
 * using latest Sentinel-2 via STAC catalog + Sentinel Hub Statistical API.
 */
import type { Feature, FeatureCollection, Geometry, Polygon, MultiPolygon } from 'geojson'
import { parseFile } from '../utils/FileLoader'
import {
  fetchSentinelFieldIndexForSceneDate,
  fetchSentinelFieldIndexTimeSeries,
  type SentinelHubDailyIndexMeans,
} from './sentinelHubStatisticsApi'
import { fetchSentinelSceneCatalogForAoi } from './siSentinelLatestScene'
import { estimateEtMmDayFromMoisture } from './etIndex'
import { estimateLstCelsius } from './lstIndex'
import { AGRO_COMPOSITE_CATEGORIES, AGRO_DERIVED_LAYER_DEFS } from './agroCompositeIndices'
import { AGRO_CHAS_FUSION_EXPR } from './chasIndex'

export type EoEnrichProgress = { message: string; pct: number }

const COMPOSITE_EXPR: Record<string, string> = (() => {
  const out: Record<string, string> = {
    CHAS: AGRO_CHAS_FUSION_EXPR,
    ADI: '0.5 * ndvi + 0.3 * ndmi + 0.2 * ndre',
  }
  for (const cat of AGRO_COMPOSITE_CATEGORIES) {
    for (const idx of cat.indices) {
      out[idx.id] = idx.expr.replace(/Math\.abs/g, 'abs')
    }
  }
  for (const d of AGRO_DERIVED_LAYER_DEFS) {
    if (d.id === 'CHAS_ALERT' || d.id === 'STRESS_ZONES') continue
    out[d.id] = d.expr.replace(/Math\.abs/g, 'abs')
  }
  return out
})()

const NON_AGRI_AOI_TYPE =
  /canal|drain|road|building|fence|pipeline|well|tower|infrastructure|pond\s*edge|boundary|buffer/i

function evalExpr(expr: string, vars: Record<string, number>): number | null {
  try {
    const env = { ...vars, abs: Math.abs }
    // eslint-disable-next-line no-new-func
    const fn = new Function(...Object.keys(env), `return (${expr});`)
    const v = fn(...Object.values(env))
    return typeof v === 'number' && Number.isFinite(v) ? v : null
  } catch {
    return null
  }
}

/** Prefer Structure_Type / AOI_Type from the feature; fall back to geometry type. */
export function resolveAoiObjectType(
  props: Record<string, unknown> | null | undefined,
  geom: Geometry,
): string {
  const p = props ?? {}
  const keys = [
    'Structure_Type',
    'structure_type',
    'AOI_Type',
    'aoi_type',
    'Object_Type',
    'object_type',
    'Type',
    'type',
    'CLASS',
    'class',
    'Category',
    'category',
  ]
  for (const k of keys) {
    const v = p[k]
    if (v != null && String(v).trim() && !/^(Polygon|MultiPolygon)$/i.test(String(v))) {
      return String(v).trim()
    }
  }
  return geom.type
}

function classifyCrop(
  ndvi: number | null,
  ndmi: number | null,
  ndwi: number | null,
  aoiType: string,
): { crop: string; conf: number } {
  if (NON_AGRI_AOI_TYPE.test(aoiType)) return { crop: 'N/A', conf: 90 }
  if (ndvi == null) return { crop: 'Unknown', conf: 0 }
  const m = ndmi ?? 0
  const w = ndwi ?? 0
  if (ndvi < 0.15) return { crop: 'Bare Soil', conf: 78 }
  if (w > 0.1 && ndvi < 0.35) return { crop: 'Unknown', conf: 45 }
  if (ndvi >= 0.65 && m >= 0.25) return { crop: 'Alfalfa', conf: 72 }
  if (ndvi >= 0.55 && m >= 0.15) return { crop: 'Rhodes Grass', conf: 68 }
  if (ndvi >= 0.45 && ndvi < 0.65 && m < 0.2) return { crop: 'Wheat', conf: 62 }
  if (ndvi >= 0.5 && ndvi < 0.7 && m >= 0.2) return { crop: 'Maize', conf: 60 }
  if (ndvi >= 0.4 && m >= 0.1) return { crop: 'Vegetables', conf: 55 }
  if (ndvi >= 0.35 && ndvi < 0.55) return { crop: 'Orchard', conf: 52 }
  if (ndvi >= 0.3) return { crop: 'Date Palm', conf: 48 }
  return { crop: 'Unknown', conf: 40 }
}

function cropHealth(ndvi: number | null, ndmi: number | null, ndre: number | null): string {
  if (ndvi == null) return 'Unknown'
  const score = 0.6 * ndvi + 0.25 * Math.max(ndmi ?? 0, 0) + 0.15 * (ndre ?? ndvi)
  if (score >= 0.7) return 'Excellent'
  if (score >= 0.55) return 'Good'
  if (score >= 0.4) return 'Moderate'
  if (score >= 0.25) return 'Poor'
  return 'Critical'
}

function waterStress(ndmi: number | null): string {
  if (ndmi == null) return 'Unknown'
  if (ndmi >= 0.3) return 'None'
  if (ndmi >= 0.2) return 'Low'
  if (ndmi >= 0.1) return 'Moderate'
  if (ndmi >= 0) return 'High'
  return 'Extreme'
}

function growthStage(ndvi: number | null): string {
  if (ndvi == null) return 'Unknown'
  if (ndvi < 0.2) return 'Planting'
  if (ndvi < 0.35) return 'Emergence'
  if (ndvi < 0.5) return 'Vegetative'
  if (ndvi < 0.65) return 'Flowering'
  if (ndvi < 0.75) return 'Maturity'
  return 'Harvest Ready'
}

function soilMoisture(ndmi: number | null): string {
  if (ndmi == null) return 'Unknown'
  if (ndmi >= 0.35) return 'Very High'
  if (ndmi >= 0.25) return 'High'
  if (ndmi >= 0.15) return 'Medium'
  if (ndmi >= 0.05) return 'Low'
  return 'Very Low'
}

function landCover(ndvi: number | null, ndwi: number | null): string {
  if (ndwi != null && ndwi > 0.2) return 'Water'
  if (ndvi == null) return 'Unknown'
  if (ndvi < 0.15) return 'Bare Soil'
  if (ndvi < 0.3) return 'Grassland'
  if (ndvi >= 0.55) return 'Agriculture'
  if (ndvi >= 0.4) return 'Forest'
  return 'Agriculture'
}

function landSuitability(ndvi: number | null, ndmi: number | null): string {
  if (ndvi == null) return 'Unknown'
  const score = ndvi + 0.3 * (ndmi ?? 0)
  if (score >= 0.75) return 'Highly Suitable'
  if (score >= 0.55) return 'Suitable'
  if (score >= 0.4) return 'Moderately Suitable'
  if (score >= 0.25) return 'Marginal'
  return 'Unsuitable'
}

function estimateYield(
  crop: string,
  ndvi: number | null,
  areaHa: number,
): { yld: number | null; total: number | null; conf: number } {
  if (ndvi == null || crop === 'N/A') return { yld: null, total: null, conf: 0 }
  const base: Record<string, number> = {
    Wheat: 3.5,
    Maize: 5.0,
    Alfalfa: 12.0,
    'Rhodes Grass': 10.0,
    Vegetables: 18.0,
    'Date Palm': 8.0,
    Orchard: 9.0,
    'Bare Soil': 0,
    Unknown: 4.0,
  }
  const b = base[crop] ?? 4.0
  const factor = Math.max(0, Math.min(1.4, (ndvi - 0.15) / 0.55))
  const yld = Number((b * factor).toFixed(3))
  return {
    yld,
    total: Number((yld * areaHa).toFixed(3)),
    conf: Number(Math.min(95, 40 + 80 * Math.abs(ndvi - 0.2)).toFixed(1)),
  }
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return ''
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function daysBetweenIso(a: string, b: string): number {
  const ta = new Date(`${a.slice(0, 10)}T12:00:00Z`).getTime()
  const tb = new Date(`${b.slice(0, 10)}T12:00:00Z`).getTime()
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return 0
  return Math.round((tb - ta) / 86_400_000)
}

/** Typical cycle length (days) for relative harvest estimate by crop class. */
function cropCycleDays(crop: string): number {
  const map: Record<string, number> = {
    Wheat: 120,
    Maize: 110,
    Alfalfa: 35,
    'Rhodes Grass': 40,
    Vegetables: 90,
    'Date Palm': 365,
    Orchard: 180,
    'Bare Soil': 0,
    Unknown: 100,
    'N/A': 100,
  }
  return map[crop] ?? 100
}

/**
 * Detect the latest planting green-up and subsequent harvest from NDVI time series
 * (same spirit as Time Series PRI/HRI planting & harvest signals).
 */
export function detectLatestPlantingAndHarvestFromSeries(
  daily: SentinelHubDailyIndexMeans[],
  crop: string,
): { plant: string | null; harvest: string | null } {
  const rows = daily
    .filter(d => typeof d.ndvi === 'number' && Number.isFinite(d.ndvi))
    .sort((a, b) => a.date.localeCompare(b.date))
  if (rows.length < 3) return { plant: null, harvest: null }

  const plantEvents: string[] = []
  for (let i = 1; i < rows.length; i += 1) {
    const cur = rows[i]!
    const prev = rows[i - 1]!
    const window = rows.slice(Math.max(0, i - 5), i)
    const minPrev = Math.min(...window.map(r => r.ndvi as number))
    const rising = (cur.ndvi as number) > (prev.ndvi as number)
    const greenUp =
      minPrev <= 0.25 &&
      (cur.ndvi as number) >= 0.32 &&
      rising &&
      (cur.ndvi as number) - minPrev >= 0.1
    if (!greenUp) continue
    const last = plantEvents[plantEvents.length - 1]
    if (!last || daysBetweenIso(last, cur.date) >= 20) plantEvents.push(cur.date)
  }

  const plant = plantEvents.length ? plantEvents[plantEvents.length - 1]! : null
  if (!plant) return { plant: null, harvest: null }

  const after = rows.filter(r => r.date >= plant)
  let peak = -Infinity
  let peakDate = plant
  for (const r of after) {
    const v = r.ndvi as number
    if (v > peak) {
      peak = v
      peakDate = r.date
    }
  }

  let harvest: string | null = null
  for (const r of after) {
    if (r.date <= peakDate) continue
    const v = r.ndvi as number
    if (peak - v >= 0.15 && v <= 0.38) {
      harvest = r.date
      break
    }
  }
  if (!harvest) {
    const cycle = cropCycleDays(crop)
    harvest = cycle > 0 ? addDaysIso(plant, cycle) : null
  }
  return { plant, harvest }
}

/** Fallback when time series has no clear green-up — relative to stage on latest scene. */
function plantingHarvestDates(stage: string, acquisitionDate: string): { plant: string; harvest: string } {
  const iso = acquisitionDate.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return { plant: '', harvest: '' }
  const offsets: Record<string, [number, number]> = {
    Planting: [0, 120],
    Emergence: [-20, 100],
    Vegetative: [-45, 75],
    Flowering: [-70, 50],
    Maturity: [-100, 25],
    'Harvest Ready': [-120, 7],
  }
  const [p, h] = offsets[stage] ?? [-60, 60]
  return { plant: addDaysIso(iso, p), harvest: addDaysIso(iso, h) }
}

/** Normalize attribute names for matching layer fields ↔ enrichment candidates. */
export function normalizeEoFieldKey(key: string): string {
  return String(key || '')
    .trim()
    .toLowerCase()
    .replace(/[%()]/g, '')
    .replace(/[\s_\-/\\.]+/g, '')
}

/** Canonical enrichment keys → alternate normalized spellings seen on farm layers. */
const ENRICH_FIELD_ALIASES: Record<string, string[]> = {
  croptype: ['croptype', 'cropclass', 'cropname', 'cultivatedcrop'],
  cropconfidence: ['cropconfidence', 'cropconf'],
  crophealth: ['crophealth', 'vegetationhealth'],
  cropgrowthstage: ['cropgrowthstage', 'growthstage', 'phenology'],
  estimatedplantingdate: [
    'estimatedplantingdate',
    'plantingdate',
    'planteddate',
    'sowdate',
    'sowingdate',
  ],
  estimatedharvestdate: [
    'estimatedharvestdate',
    'harvestdate',
    'harvesteddate',
    'expectedharvestdate',
  ],
  waterstress: ['waterstress', 'moisturestress', 'droughtstress'],
  soilmoisture: ['soilmoisture'],
  agriculturalstatus: ['agriculturalstatus', 'agristatus', 'farmstatus'],
  activitystatus: ['activitystatus', 'activestatus'],
  landcovertype: ['landcovertype', 'landcover', 'lulc', 'covertype'],
  vegetationcoverpercent: ['vegetationcoverpercent', 'vegcover', 'vegpct', 'vegetationpercent'],
  estimatedareaha: ['estimatedareaha', 'areaha', 'hectares'],
  cultivatedareaha: ['cultivatedareaha', 'cultivatedha', 'cultivatedarea'],
  objecttype: ['objecttype', 'structuretype', 'aoitype', 'featuretype'],
  objectname: ['objectname', 'name', 'fieldname', 'plotname'],
  objectid: ['objectid', 'fid', 'plotid', 'fieldid'],
  ndvi: ['ndvi', 'ndvimean', 'meanndvi'],
  ndmi: ['ndmi', 'ndmimean'],
  ndwi: ['ndwi', 'ndwimean'],
  evi: ['evi', 'evimean'],
  savi: ['savi', 'savimean'],
  ndre: ['ndre', 'ndremean'],
  recommendation: ['recommendation'],
  acquisitiondate: ['acquisitiondate', 'scenedate', 'imagedate', 'satellitedate'],
  satellitename: ['satellitename'],
  satellitesource: ['satellitesource'],
  sceneid: ['sceneid', 'productid'],
  estimatedyield: ['estimatedyield', 'yieldtha'],
  estimatedtotalproduction: ['estimatedtotalproduction', 'totalproduction'],
  irrigationperformance: ['irrigationperformance'],
  fieldinspectionpriority: ['fieldinspectionpriority', 'inspectionpriority'],
  newlycultivated: ['newlycultivated', 'newfarm'],
  changepreviousperiod: ['changepreviousperiod', 'ndvichange'],
  timeseries: ['timeseries', 'ndvitrend'],
  landsuitability: ['landsuitability'],
  soilsalinity: ['soilsalinity'],
  landdegradation: ['landdegradation'],
  actualet: ['actualet', 'evapotranspiration'],
  cropwaterrequirement: ['cropwaterrequirement', 'cwr', 'waterrequirement'],
  centroidlat: ['centroidlat'],
  centroidlon: ['centroidlon'],
}

function canonicalEnrichKey(normalized: string): string | null {
  if (!normalized) return null
  if (ENRICH_FIELD_ALIASES[normalized]) return normalized
  for (const [canon, alts] of Object.entries(ENRICH_FIELD_ALIASES)) {
    if (alts.includes(normalized)) return canon
  }
  // Direct pass-through for index ids (NDVI, CHAS, …) already normalized
  return normalized
}

/** Union of attribute keys present on the input layer (no new fields will be added). */
export function collectExistingLayerFieldKeys(features: Feature[]): string[] {
  const order: string[] = []
  const seen = new Set<string>()
  for (const f of features) {
    for (const k of Object.keys(f.properties ?? {})) {
      if (!seen.has(k)) {
        seen.add(k)
        order.push(k)
      }
    }
  }
  return order
}

/**
 * Write enrichment values only into keys that already exist on the feature/layer.
 * Preserves original key spelling; never introduces new attributes.
 */
export function applyEnrichmentToExistingFields(
  existingProps: Record<string, unknown>,
  candidates: Record<string, unknown>,
  layerKeys: string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...existingProps }
  if (!layerKeys.length) return out

  const candidateByCanon = new Map<string, unknown>()
  for (const [k, v] of Object.entries(candidates)) {
    if (v === undefined) continue
    const canon = canonicalEnrichKey(normalizeEoFieldKey(k))
    if (canon) candidateByCanon.set(canon, v)
  }

  for (const layerKey of layerKeys) {
    if (!(layerKey in existingProps) && !Object.prototype.hasOwnProperty.call(existingProps, layerKey)) {
      // Still allow keys listed on sibling features but missing on this one — user asked fill existing layer schema
    }
    const canon = canonicalEnrichKey(normalizeEoFieldKey(layerKey))
    if (!canon || !candidateByCanon.has(canon)) continue
    // Do not overwrite stable identifiers that already have a value
    if (
      (canon === 'objectname' || canon === 'objectid') &&
      existingProps[layerKey] != null &&
      String(existingProps[layerKey]).trim() !== ''
    ) {
      continue
    }
    out[layerKey] = candidateByCanon.get(canon)
  }
  return out
}

function recommendation(health: string, stress: string, anomaly: boolean, stage: string): string {
  if (anomaly) return 'Field inspection required'
  if (health === 'Critical' || health === 'Poor' || stress === 'High' || stress === 'Extreme') {
    return 'Increase irrigation'
  }
  if (stress === 'Moderate') return 'Monitor stress'
  if (stage === 'Harvest Ready') return 'Harvest within 2 weeks'
  if (health === 'Excellent' || health === 'Good') return 'Healthy crop'
  return 'Continue routine monitoring'
}

function irrigationPerformance(ndmi: number | null, ndvi: number | null): string {
  if (ndmi == null || ndvi == null) return 'Unknown'
  if (ndmi >= 0.25 && ndvi >= 0.45) return 'Optimal'
  if (ndmi >= 0.15) return 'Adequate'
  if (ndmi >= 0.05) return 'Under-irrigated'
  return 'Severely under-irrigated'
}

function soilSalinity(ndvi: number | null, ndwi: number | null): string {
  if (ndvi == null) return 'Unknown'
  if (ndvi < 0.2 && (ndwi ?? 0) < -0.1) return 'High'
  if (ndvi < 0.3) return 'Moderate'
  return 'Low'
}

function areaHa(geom: Geometry): number {
  if (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon') return 0
  const rings: number[][][] =
    geom.type === 'Polygon' ? [geom.coordinates[0]!] : geom.coordinates.map(p => p[0]!)
  let m2 = 0
  for (const ring of rings) {
    let sum = 0
    for (let i = 0; i < ring.length - 1; i += 1) {
      const [x1, y1] = ring[i]!
      const [x2, y2] = ring[i + 1]!
      sum +=
        ((x2! * Math.PI) / 180) * Math.sin((y1! * Math.PI) / 180) -
        ((x1! * Math.PI) / 180) * Math.sin((y2! * Math.PI) / 180)
    }
    m2 += Math.abs((sum * 6378137 * 6378137) / 2)
  }
  return m2 / 10_000
}

function centroid(geom: Geometry): { lon: number; lat: number } | null {
  if (geom.type === 'Polygon') {
    const r = geom.coordinates[0]
    if (!r?.length) return null
    let sx = 0
    let sy = 0
    for (const c of r) {
      sx += c[0]!
      sy += c[1]!
    }
    return { lon: sx / r.length, lat: sy / r.length }
  }
  if (geom.type === 'MultiPolygon') {
    return centroid({ type: 'Polygon', coordinates: geom.coordinates[0]! })
  }
  return null
}

function pickLatest(daily: SentinelHubDailyIndexMeans[]): SentinelHubDailyIndexMeans | null {
  const valid = daily
    .filter(d => d.ndvi != null || d.ndmi != null || d.ndwi != null)
    .sort((a, b) => a.date.localeCompare(b.date))
  if (!valid.length) return null
  return valid[valid.length - 1]!
}

function pickPrevious(
  daily: SentinelHubDailyIndexMeans[],
  latestDate: string,
): SentinelHubDailyIndexMeans | null {
  const older = daily
    .filter(d => d.date < latestDate && (d.ndvi != null || d.ndmi != null))
    .sort((a, b) => a.date.localeCompare(b.date))
  return older.length ? older[older.length - 1]! : null
}

function vegCoverPct(ndvi: number | null): number | null {
  if (ndvi == null) return null
  return Number(Math.max(0, Math.min(100, ((ndvi - 0.1) / 0.6) * 100)).toFixed(1))
}

function enrichPropsFromMeans(
  means: SentinelHubDailyIndexMeans,
  geom: Geometry,
  objectId: number,
  name: string,
  aoiType: string,
  prev: SentinelHubDailyIndexMeans | null,
  daily: SentinelHubDailyIndexMeans[],
): Record<string, unknown> {
  const ndvi = means.ndvi
  const ndmi = means.ndmi
  const ndwi = means.ndwi
  const savi = means.savi
  const evi = means.evi
  const ndre = means.ndre ?? null
  const ndsi = means.ndsi ?? null
  const si = means.si ?? null
  const ssi = means.ssi ?? null
  const vars = {
    ndvi: ndvi ?? 0,
    ndmi: ndmi ?? 0,
    ndwi: ndwi ?? 0,
    savi: savi ?? 0,
    evi: evi ?? 0,
    ndre: ndre ?? ndvi ?? 0,
    ndsi: ndsi ?? 0,
    si: si ?? 0,
    ssi: ssi ?? 0,
  }
  const nonAgri = NON_AGRI_AOI_TYPE.test(aoiType)
  const { crop, conf } = classifyCrop(ndvi, ndmi, ndwi, aoiType)
  const health = nonAgri ? 'N/A' : cropHealth(ndvi, ndmi, ndre)
  const stress = waterStress(ndmi)
  const stage = nonAgri ? 'N/A' : growthStage(ndvi)
  const cover = landCover(ndvi, ndwi)
  const vegPct = vegCoverPct(ndvi)
  const ha = areaHa(geom)
  const et = estimateEtMmDayFromMoisture(ndmi ?? 0, ndwi ?? 0, { ndvi, sceneDate: means.date })
  const lst = estimateLstCelsius(ndvi ?? 0.3, ndmi ?? 0, { sceneDate: means.date })
  const c = centroid(geom)
  const prevNdvi = prev?.ndvi ?? null
  const change =
    ndvi == null || prevNdvi == null
      ? 'No Change'
      : ndvi - prevNdvi > 0.08
        ? 'Expansion'
        : ndvi - prevNdvi < -0.08
          ? 'Reduction'
          : 'No Change'
  const newly =
    ndvi == null || prevNdvi == null
      ? 'Stable'
      : prevNdvi < 0.2 && ndvi >= 0.35
        ? 'New Farm'
        : prevNdvi >= 0.35 && ndvi < 0.2
          ? 'Abandoned'
          : 'Stable'
  const trend =
    ndvi == null || prevNdvi == null
      ? 'Unknown'
      : ndvi - prevNdvi > 0.05
        ? 'Improving'
        : ndvi - prevNdvi < -0.05
          ? 'Declining'
          : 'Stable'
  const anomaly =
    (ndwi != null && ndwi > 0.35 && (ndvi ?? 0) < 0.25) ||
    (ndvi != null && ndvi < 0.12 && (ndmi ?? 0) < 0)

  // Prefer latest planting/harvest from NDVI time series; else relative to phenology stage.
  const fromTs = nonAgri
    ? { plant: null as string | null, harvest: null as string | null }
    : detectLatestPlantingAndHarvestFromSeries(daily.length ? daily : [means], crop)
  const fallback = plantingHarvestDates(stage === 'N/A' ? 'Vegetative' : stage, means.date)
  const plant = fromTs.plant || fallback.plant
  const harvest = fromTs.harvest || fallback.harvest

  const { yld, total, conf: yconf } = estimateYield(crop, ndvi, ha)
  const agri =
    nonAgri || cover === 'Water' || cover === 'Bare Soil'
      ? 'Non Agricultural'
      : (ndvi ?? 0) >= 0.25
        ? 'Agricultural'
        : 'Non Agricultural'
  const activity = nonAgri ? 'N/A' : (ndvi ?? 0) >= 0.3 || (vegPct ?? 0) >= 25 ? 'Active' : 'Inactive'
  const et0 = 5
  const kc = Math.max(0.2, Math.min(1.2, (ndvi ?? 0) * 1.4))
  const etc = Number((et0 * kc).toFixed(2))
  const cwr = Number((etc * 30).toFixed(2))
  const waterUse = Number((cwr * 10 * ha).toFixed(1))
  const wp = Number((Math.max(0.1, (ndvi ?? 0) * 10) / Math.max(cwr, 1)).toFixed(3))
  const zonal = means.zonal
  const pixelCount: number | null = null
  let quality = 100
  if (ndvi == null && ndmi == null) quality -= 40
  quality = Math.max(0, quality)

  const out: Record<string, unknown> = {
    Object_ID: objectId,
    Object_Type: aoiType,
    Object_Name: name,
    Boundary: geom.type,
    Centroid_Lat: c?.lat != null ? Number(c.lat.toFixed(6)) : null,
    Centroid_Lon: c?.lon != null ? Number(c.lon.toFixed(6)) : null,
    Estimated_Area_ha: Number(ha.toFixed(4)),
    Agricultural_Status: agri,
    Activity_Status: activity,
    Land_Cover_Type: cover,
    Vegetation_Cover_Percent: vegPct,
    Crop_Type: crop,
    Crop_Confidence: conf,
    Cultivated_Area_ha:
      ha > 0 && vegPct != null ? Number(((ha * vegPct) / 100).toFixed(4)) : null,
    Crop_Growth_Stage: stage,
    Estimated_Planting_Date: nonAgri ? '' : plant,
    Estimated_Harvest_Date: nonAgri ? '' : harvest,
    Crop_Health: health,
    NDVI: ndvi,
    NDMI: ndmi,
    NDWI: ndwi,
    SAVI: savi,
    EVI: evi,
    NDRE: ndre,
    NDSI: ndsi,
    SI: si,
    SSI: ssi,
    ET: et,
    LST: lst,
    Water_Stress: stress,
    Soil_Moisture: soilMoisture(ndmi),
    Actual_ET: et ?? etc,
    Crop_Water_Requirement: cwr,
    Irrigation_Performance: irrigationPerformance(ndmi, ndvi),
    Estimated_Water_Use: waterUse,
    Water_Productivity: wp,
    Soil_Salinity: soilSalinity(ndvi, ndwi),
    Land_Degradation:
      ndvi == null
        ? 'Unknown'
        : prevNdvi != null && prevNdvi - ndvi > 0.15
          ? 'Degrading'
          : ndvi < 0.2
            ? 'Degraded'
            : 'Stable',
    Land_Suitability: landSuitability(ndvi, ndmi),
    Estimated_Yield: yld,
    Estimated_Total_Production: total,
    Yield_Confidence: yconf,
    Change_Previous_Period: change,
    Newly_Cultivated: newly,
    Anomaly: anomaly,
    Field_Inspection_Priority: anomaly || health === 'Critical' || stress === 'Extreme'
      ? 'Critical'
      : health === 'Poor' || stress === 'High'
        ? 'High'
        : health === 'Moderate' || stress === 'Moderate'
          ? 'Medium'
          : 'Low',
    Recommendation: nonAgri
      ? 'Non-agricultural AOI — spectral indices only'
      : recommendation(health, stress, anomaly, stage),
    TimeSeries: trend,
    Satellite_Name: 'Sentinel-2',
    Satellite_Source: 'Sentinel Hub Statistical API · latest L2A',
    Acquisition_Date: means.date,
    Processing_Date: new Date().toISOString(),
    Scene_ID: means.date,
    Cloud_Cover: null,
    Cloud_Cover_Pct: null,
    Spatial_Resolution: 20,
    NDVI_Min: zonal?.ndvi?.min ?? null,
    NDVI_Max: zonal?.ndvi?.max ?? null,
    NDVI_Mean: ndvi,
    NDMI_Mean: ndmi,
    EVI_Mean: evi,
    Pixel_Count: pixelCount,
    Data_Quality_Score: quality,
    Analysis_Confidence: Number(Math.min(95, (conf + quality) / 2).toFixed(1)),
    Last_Update: new Date().toISOString(),
  }
  for (const [id, expr] of Object.entries(COMPOSITE_EXPR)) {
    const v = evalExpr(expr, vars)
    if (v != null) out[id] = Number(v.toFixed(4))
  }
  return out
}

function isPoly(g: Geometry | null | undefined): g is Polygon | MultiPolygon {
  return !!g && (g.type === 'Polygon' || g.type === 'MultiPolygon')
}

async function fetchMeansForLatestScene(
  geom: Geometry,
  maxCloud: number,
  lookbackDays: number,
  signal?: AbortSignal,
): Promise<{
  means: SentinelHubDailyIndexMeans | null
  prev: SentinelHubDailyIndexMeans | null
  daily: SentinelHubDailyIndexMeans[]
  error?: string
}> {
  // 1) Prefer STAC catalog → exact latest scene date (matches Python search_latest_s2)
  let sceneDates: string[] = []
  try {
    const catalog = await fetchSentinelSceneCatalogForAoi(
      { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: geom, properties: {} }] },
      { cloudCoverMax: maxCloud, signal },
    )
    sceneDates = catalog.sceneIsos.slice(0, 6)
  } catch (err) {
    if (signal?.aborted) throw err
  }

  let means: SentinelHubDailyIndexMeans | null = null
  for (const sceneDate of sceneDates) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    try {
      let row = await fetchSentinelFieldIndexForSceneDate(geom, sceneDate, {
        maxCloudCoverage: Math.max(maxCloud, 40),
        relaxedCloudMask: false,
        signal,
      })
      if (!row || row.ndvi == null) {
        row = await fetchSentinelFieldIndexForSceneDate(geom, sceneDate, {
          maxCloudCoverage: 95,
          relaxedCloudMask: true,
          signal,
        })
      }
      if (row && (row.ndvi != null || row.ndmi != null || row.ndwi != null)) {
        means = row
        break
      }
    } catch (err) {
      if (signal?.aborted) throw err
    }
  }

  // 2) Always pull lookback series for planting/harvest + fallback latest day
  let daily: SentinelHubDailyIndexMeans[] = []
  try {
    daily = await fetchSentinelFieldIndexTimeSeries({
      geometry: geom,
      referenceDate: new Date().toISOString().slice(0, 10),
      lookbackDays,
      maxCloudCoverage: Math.max(maxCloud, 30),
      relaxedCloudMask: true,
      signal,
    })
  } catch (err) {
    if (signal?.aborted) throw err
    return {
      means,
      prev: null,
      daily: [],
      error: err instanceof Error ? err.message : String(err),
    }
  }

  if (!means) means = pickLatest(daily)
  const prev = means ? pickPrevious(daily, means.date) : null
  if (!means) {
    return {
      means: null,
      prev: null,
      daily,
      error: sceneDates.length
        ? 'Latest Sentinel-2 scenes found but no valid zonal statistics for this AOI.'
        : 'No Sentinel-2 scenes / statistics for this AOI — check tokens, cloud cover, or geometry.',
    }
  }
  return { means, prev, daily }
}

export async function runEoLayerEnrichment(options: {
  file?: File | null
  geojson?: FeatureCollection | null
  maxCloudCoverage?: number
  lookbackDays?: number
  signal?: AbortSignal
  onProgress?: (p: EoEnrichProgress) => void
}): Promise<{ geojson: FeatureCollection; featureCount: number; acquisitionDate: string | null }> {
  const progress = (message: string, pct: number) => options.onProgress?.({ message, pct })
  progress('Loading vector…', 5)

  let fc: FeatureCollection
  if (options.geojson) {
    fc = options.geojson
  } else if (options.file) {
    const parsed = await parseFile(options.file)
    if (parsed.type !== 'geojson' || !parsed.data) {
      throw new Error('Only vector layers (KMZ/KML/SHP/GeoJSON/GPKG) are supported.')
    }
    fc = parsed.data as FeatureCollection
  } else {
    throw new Error('Provide a file or GeoJSON layer.')
  }

  const features = (fc.features ?? []).filter(f => isPoly(f.geometry))
  if (!features.length) throw new Error('No polygon features found in the layer.')

  const layerKeys = collectExistingLayerFieldKeys(features)
  if (!layerKeys.length) {
    throw new Error(
      'This layer has no attribute fields. EO Enrich only fills existing fields — add columns first or use a schema-ready farm layer.',
    )
  }

  const enriched: Feature[] = []
  let acquisitionDate: string | null = null
  let okCount = 0
  let lastError: string | null = null
  const n = features.length
  const maxCloud = options.maxCloudCoverage ?? 20
  const lookback = options.lookbackDays ?? 180

  for (let i = 0; i < n; i += 1) {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const f = features[i]!
    const geom = f.geometry as Geometry
    const props = (f.properties ?? {}) as Record<string, unknown>
    const name = String(props.Name ?? props.name ?? props.Object_Name ?? `Object_${i + 1}`)
    const aoiType = resolveAoiObjectType(props, geom)
    progress(
      `Filling existing fields · ${aoiType} ${i + 1}/${n} (latest S2 + planting TS)…`,
      10 + (80 * i) / n,
    )

    const { means, prev, daily, error } = await fetchMeansForLatestScene(
      geom,
      maxCloud,
      lookback,
      options.signal,
    )
    if (error) lastError = error

    if (means) {
      const candidates = enrichPropsFromMeans(means, geom, i + 1, name, aoiType, prev, daily)
      const filled = applyEnrichmentToExistingFields(props, candidates, layerKeys)
      enriched.push({ type: 'Feature', geometry: geom, properties: filled })
      okCount += 1
      if (means.date) acquisitionDate = means.date
    } else {
      enriched.push({ type: 'Feature', geometry: geom, properties: { ...props } })
    }
  }

  if (okCount === 0) {
    throw new Error(lastError || 'Enrichment failed for all polygons — no Sentinel-2 statistics available.')
  }

  progress('Done.', 100)
  return {
    geojson: { type: 'FeatureCollection', features: enriched },
    featureCount: enriched.length,
    acquisitionDate,
  }
}

export function downloadEoGeoJson(fc: FeatureCollection, filename: string) {
  const blob = new Blob([JSON.stringify(fc)], { type: 'application/geo+json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadEoCsv(fc: FeatureCollection, filename: string) {
  const rows = fc.features.map(f => f.properties ?? {})
  const keys = Array.from(new Set(rows.flatMap(r => Object.keys(r))))
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [keys.join(','), ...rows.map(r => keys.map(k => esc((r as Record<string, unknown>)[k])).join(','))]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Collect property keys across features — preserve layer schema order (no invented fields). */
export function collectEoEnrichmentFieldKeys(fc: FeatureCollection): string[] {
  return collectExistingLayerFieldKeys(fc.features ?? [])
}

/** Popup config so identify shows EO enrichment attributes in a useful order. */
export function buildEoEnrichmentPopupConfig(fc: FeatureCollection): {
  v: 1
  popupEnabled: true
  hiddenFieldKeys: string[]
  fieldOrder: string[]
  groups: Array<{ id: string; title: string; fieldKeys: string[] }>
  showRelated: boolean
  showAttachments: boolean
  showMedia: boolean
  viewMode: 'table'
  densityMode: 'tabbed'
} {
  const fieldOrder = collectEoEnrichmentFieldKeys(fc)
  const identity = fieldOrder.filter(k => /^(Object_|Centroid_|Estimated_Area|Boundary)/i.test(k))
  const crop = fieldOrder.filter(k =>
    /^(Crop_|Water_Stress|Soil_|Agricultural_Status|Activity_Status|Land_|Irrigation_|Estimated_Yield|Estimated_Total|Change_|Newly_|Anomaly|Field_Inspection|Recommendation|TimeSeries|Vegetation_)/i.test(
      k,
    ),
  )
  const indices = fieldOrder.filter(
    k =>
      /^(NDVI|NDMI|NDWI|SAVI|EVI|NDRE|NDSI|SI|SSI|ET|LST|Actual_ET|Crop_Water|Estimated_Water|Water_Productivity)/i.test(
        k,
      ) || COMPOSITE_EXPR[k] != null,
  )
  const satellite = fieldOrder.filter(k =>
    /^(Satellite_|Acquisition_|Processing_|Scene_|Cloud_|Spatial_|Pixel_|Data_Quality|Analysis_Confidence|Last_Update)/i.test(
      k,
    ),
  )
  const used = new Set([...identity, ...crop, ...indices, ...satellite])
  const other = fieldOrder.filter(k => !used.has(k))
  const groups = [
    identity.length ? { id: 'eo-identity', title: 'Object', fieldKeys: identity } : null,
    crop.length ? { id: 'eo-crop', title: 'Crop & stress', fieldKeys: crop } : null,
    indices.length ? { id: 'eo-indices', title: 'Spectral indices', fieldKeys: indices } : null,
    satellite.length ? { id: 'eo-sat', title: 'Satellite', fieldKeys: satellite } : null,
    other.length ? { id: 'eo-other', title: 'Attributes', fieldKeys: other } : null,
  ].filter(Boolean) as Array<{ id: string; title: string; fieldKeys: string[] }>

  return {
    v: 1,
    popupEnabled: true,
    hiddenFieldKeys: [],
    fieldOrder,
    groups,
    showRelated: false,
    showAttachments: false,
    showMedia: false,
    viewMode: 'table',
    densityMode: 'tabbed',
  }
}
