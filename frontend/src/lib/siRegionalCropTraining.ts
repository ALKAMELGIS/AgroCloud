/**
 * Regional crop training / calibration — lightweight support for Crop Classification.
 * Uses known field labels + Sentinel spectral time series to refine crop assignments locally.
 * Separate from Layer Live; pairs with the Crop Classification tool only.
 */

import {
  fetchSentinelFieldIndexTimeSeriesForRange,
  type SentinelHubDailyIndexMeans,
} from './sentinelHubStatisticsApi'
import { subtractDaysFromIso } from './siSentinelImageryDate'

export type RegionalCropDefinition = {
  id: string
  label: string
  color: string
}

/** Common regional crops — user enables subset for their AOI. */
export const REGIONAL_CROP_PRESETS: readonly RegionalCropDefinition[] = [
  { id: 'wheat', label: 'Wheat', color: '#b8860b' },
  { id: 'corn', label: 'Corn', color: '#facc15' },
  { id: 'barley', label: 'Barley', color: '#ca8a04' },
  { id: 'alfalfa', label: 'Alfalfa', color: '#db2777' },
  { id: 'cotton', label: 'Cotton', color: '#ef4444' },
  { id: 'rice', label: 'Rice', color: '#06b6d4' },
  { id: 'sorghum', label: 'Sorghum', color: '#f97316' },
  { id: 'soybeans', label: 'Soybeans', color: '#15803d' },
  { id: 'dates', label: 'Dates / Orchard', color: '#854d0e' },
  { id: 'vegetables', label: 'Vegetables', color: '#84cc16' },
  { id: 'fallow', label: 'Fallow / Idle', color: '#a8a29e' },
  { id: 'other', label: 'Other', color: '#22d3ee' },
] as const

export type SpectralFeatureVector = {
  ndviMean: number
  ndwiMean: number
  ndmiMean: number
  eviMean: number
  saviMean: number
  ndviAmp: number
  sceneCount: number
}

export type RegionalTrainingSample = {
  id: string
  cropId: string
  cropLabel: string
  color: string
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon | GeoJSON.Point
  fieldId?: string
  fieldName?: string
  features: SpectralFeatureVector | null
  createdAt: number
}

export type RegionalCropCatalog = {
  enabledCropIds: string[]
  customCrops: RegionalCropDefinition[]
}

export type RegionalCalibrationAssignment = {
  fieldId: string
  fieldName: string
  cropId: string
  cropLabel: string
  color: string
  confidence: number
  distance: number
}

export type RegionalCalibrationResult = {
  calibratedAt: number
  seasonStart: string
  seasonEnd: string
  samplesUsed: number
  classCentroids: Record<string, SpectralFeatureVector>
  assignments: RegionalCalibrationAssignment[]
  accuracyOnSamples: number | null
  statusMessage: string
}

export type RegionalCropTrainingState = {
  catalog: RegionalCropCatalog
  samples: RegionalTrainingSample[]
  calibration: RegionalCalibrationResult | null
  pickMode: boolean
  activeCropId: string
  overlayVisible: boolean
  loading: boolean
  statusMessage: string
}

export const DEFAULT_REGIONAL_CROP_CATALOG: RegionalCropCatalog = {
  enabledCropIds: ['wheat', 'corn', 'alfalfa', 'cotton', 'fallow'],
  customCrops: [],
}

export const DEFAULT_REGIONAL_CROP_TRAINING_STATE: RegionalCropTrainingState = {
  catalog: DEFAULT_REGIONAL_CROP_CATALOG,
  samples: [],
  calibration: null,
  pickMode: false,
  activeCropId: 'wheat',
  overlayVisible: true,
  loading: false,
  statusMessage: '',
}

export function newRegionalTrainingSampleId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `rts-${crypto.randomUUID()}`
    : `rts-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function resolveRegionalCropCatalog(
  catalog: RegionalCropCatalog,
): RegionalCropDefinition[] {
  const presetMap = new Map(REGIONAL_CROP_PRESETS.map(c => [c.id, c]))
  const out: RegionalCropDefinition[] = []
  for (const id of catalog.enabledCropIds) {
    const p = presetMap.get(id) ?? catalog.customCrops.find(c => c.id === id)
    if (p) out.push(p)
  }
  for (const c of catalog.customCrops) {
    if (!out.some(x => x.id === c.id)) out.push(c)
  }
  return out
}

export function cropDefById(
  catalog: RegionalCropCatalog,
  cropId: string,
): RegionalCropDefinition | null {
  return resolveRegionalCropCatalog(catalog).find(c => c.id === cropId) ?? null
}

function meanOf(vals: (number | null | undefined)[]): number | null {
  const nums = vals.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  if (!nums.length) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

export function buildSpectralFeaturesFromDaily(
  daily: SentinelHubDailyIndexMeans[],
): SpectralFeatureVector | null {
  if (!daily.length) return null
  const ndviVals = daily.map(d => d.ndvi)
  const ndviNums = ndviVals.filter((v): v is number => v != null)
  const ndviMin = ndviNums.length ? Math.min(...ndviNums) : 0
  const ndviMax = ndviNums.length ? Math.max(...ndviNums) : 0
  const ndviMean = meanOf(ndviVals)
  if (ndviMean == null) return null
  return {
    ndviMean,
    ndwiMean: meanOf(daily.map(d => d.ndwi)) ?? 0,
    ndmiMean: meanOf(daily.map(d => d.ndmi)) ?? 0,
    eviMean: meanOf(daily.map(d => d.evi)) ?? 0,
    saviMean: meanOf(daily.map(d => d.savi)) ?? 0,
    ndviAmp: ndviMax - ndviMin,
    sceneCount: daily.filter(d => d.ndvi != null).length,
  }
}

export async function extractSpectralFeaturesForGeometry(
  geometry: GeoJSON.Geometry,
  seasonStart: string,
  seasonEnd: string,
  signal?: AbortSignal,
): Promise<SpectralFeatureVector | null> {
  const fromIso = seasonStart.trim().slice(0, 10)
  const toIso = seasonEnd.trim().slice(0, 10)
  if (!fromIso || !toIso || toIso < fromIso) return null
  let daily = await fetchSentinelFieldIndexTimeSeriesForRange({
    geometry,
    fromIso,
    toIso,
    signal,
  })
  if (!daily.some(d => d.ndvi != null)) {
    daily = await fetchSentinelFieldIndexTimeSeriesForRange({
      geometry,
      fromIso,
      toIso,
      maxCloudCoverage: 95,
      relaxedCloudMask: true,
      signal,
    })
  }
  return buildSpectralFeaturesFromDaily(daily)
}

export function featureVectorDistance(a: SpectralFeatureVector, b: SpectralFeatureVector): number {
  const w = { ndvi: 2.2, ndwi: 1.0, ndmi: 1.2, evi: 1.4, savi: 1.0, amp: 1.8 }
  const d =
    w.ndvi * (a.ndviMean - b.ndviMean) ** 2 +
    w.ndwi * (a.ndwiMean - b.ndwiMean) ** 2 +
    w.ndmi * (a.ndmiMean - b.ndmiMean) ** 2 +
    w.evi * (a.eviMean - b.eviMean) ** 2 +
    w.savi * (a.saviMean - b.saviMean) ** 2 +
    w.amp * (a.ndviAmp - b.ndviAmp) ** 2
  return Math.sqrt(d)
}

export function buildClassCentroids(
  samples: RegionalTrainingSample[],
): Record<string, SpectralFeatureVector> {
  const buckets = new Map<string, SpectralFeatureVector[]>()
  for (const s of samples) {
    if (!s.features) continue
    const arr = buckets.get(s.cropId) ?? []
    arr.push(s.features)
    buckets.set(s.cropId, arr)
  }
  const out: Record<string, SpectralFeatureVector> = {}
  for (const [cropId, vecs] of buckets) {
    if (!vecs.length) continue
    out[cropId] = {
      ndviMean: meanOf(vecs.map(v => v.ndviMean)) ?? 0,
      ndwiMean: meanOf(vecs.map(v => v.ndwiMean)) ?? 0,
      ndmiMean: meanOf(vecs.map(v => v.ndmiMean)) ?? 0,
      eviMean: meanOf(vecs.map(v => v.eviMean)) ?? 0,
      saviMean: meanOf(vecs.map(v => v.saviMean)) ?? 0,
      ndviAmp: meanOf(vecs.map(v => v.ndviAmp)) ?? 0,
      sceneCount: Math.round(meanOf(vecs.map(v => v.sceneCount)) ?? 0),
    }
  }
  return out
}

export function assignFeaturesToCrop(
  features: SpectralFeatureVector,
  centroids: Record<string, SpectralFeatureVector>,
  catalog: RegionalCropCatalog,
): { cropId: string; cropLabel: string; color: string; confidence: number; distance: number } | null {
  const crops = resolveRegionalCropCatalog(catalog).filter(c => centroids[c.id])
  if (!crops.length) return null
  let best = crops[0]!
  let bestDist = Infinity
  for (const crop of crops) {
    const centroid = centroids[crop.id]
    if (!centroid) continue
    const dist = featureVectorDistance(features, centroid)
    if (dist < bestDist) {
      bestDist = dist
      best = crop
    }
  }
  const maxDist = 0.85
  const confidence = Math.max(0, Math.min(1, 1 - bestDist / maxDist))
  return {
    cropId: best.id,
    cropLabel: best.label,
    color: best.color,
    confidence,
    distance: bestDist,
  }
}

export type FieldForCalibration = {
  id: string
  name: string
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon
}

export function calibrateRegionalCrops(options: {
  samples: RegionalTrainingSample[]
  catalog: RegionalCropCatalog
  fields: FieldForCalibration[]
  fieldFeatures: Map<string, SpectralFeatureVector | null>
  seasonStart: string
  seasonEnd: string
}): RegionalCalibrationResult {
  const labeled = options.samples.filter(s => s.features)
  const centroids = buildClassCentroids(labeled)
  const cropKeys = Object.keys(centroids)
  if (!cropKeys.length) {
    return {
      calibratedAt: Date.now(),
      seasonStart: options.seasonStart,
      seasonEnd: options.seasonEnd,
      samplesUsed: 0,
      classCentroids: {},
      assignments: [],
      accuracyOnSamples: null,
      statusMessage: 'Add at least one labeled training sample with valid Sentinel scenes.',
    }
  }

  const assignments: RegionalCalibrationAssignment[] = []
  let correct = 0
  let tested = 0

  for (const field of options.fields) {
    const features = options.fieldFeatures.get(field.id)
    if (!features) continue
    const hit = assignFeaturesToCrop(features, centroids, options.catalog)
    if (!hit) continue
    assignments.push({
      fieldId: field.id,
      fieldName: field.name,
      cropId: hit.cropId,
      cropLabel: hit.cropLabel,
      color: hit.color,
      confidence: hit.confidence,
      distance: hit.distance,
    })
  }

  for (const sample of labeled) {
    if (!sample.features || !sample.fieldId) continue
    const hit = assignFeaturesToCrop(sample.features, centroids, options.catalog)
    if (!hit) continue
    tested += 1
    if (hit.cropId === sample.cropId) correct += 1
  }

  const accuracyOnSamples = tested > 0 ? correct / tested : null
  return {
    calibratedAt: Date.now(),
    seasonStart: options.seasonStart,
    seasonEnd: options.seasonEnd,
    samplesUsed: labeled.length,
    classCentroids: centroids,
    assignments,
    accuracyOnSamples,
    statusMessage:
      assignments.length > 0
        ? `Regional calibration: ${assignments.length} field(s) · ${labeled.length} training sample(s)${
            accuracyOnSamples != null ? ` · hold-out accuracy ${(accuracyOnSamples * 100).toFixed(0)}%` : ''
          }.`
        : 'No fields could be assigned — draw fields inside AOI or add more training samples.',
  }
}

export function buildCalibratedFieldsGeoJson(
  fields: FieldForCalibration[],
  assignments: RegionalCalibrationAssignment[],
): GeoJSON.FeatureCollection {
  const byId = new Map(assignments.map(a => [a.fieldId, a]))
  const features: GeoJSON.Feature[] = []
  for (const field of fields) {
    const a = byId.get(field.id)
    if (!a) continue
    features.push({
      type: 'Feature',
      geometry: field.geometry,
      properties: {
        fieldId: field.id,
        fieldName: field.name,
        cropId: a.cropId,
        cropLabel: a.cropLabel,
        confidence: a.confidence,
        fillColor: a.color,
        strokeColor: a.color,
      },
    })
  }
  return { type: 'FeatureCollection', features }
}

export function defaultSeasonRange(endDate: string, lookbackDays = 120): {
  seasonStart: string
  seasonEnd: string
} {
  const end = String(endDate || '').trim().slice(0, 10)
  return { seasonEnd: end, seasonStart: subtractDaysFromIso(end, lookbackDays) }
}

const STORAGE_KEY = 'agrocloud.regionalCropTraining.v1'

export function loadRegionalCropTrainingState(aoiKey: string): Partial<RegionalCropTrainingState> | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}:${aoiKey}`)
    if (!raw) return null
    return JSON.parse(raw) as Partial<RegionalCropTrainingState>
  } catch {
    return null
  }
}

export function saveRegionalCropTrainingState(aoiKey: string, state: RegionalCropTrainingState): void {
  try {
    const payload: RegionalCropTrainingState = {
      ...state,
      loading: false,
      pickMode: false,
    }
    localStorage.setItem(`${STORAGE_KEY}:${aoiKey}`, JSON.stringify(payload))
  } catch {
    /* ignore quota */
  }
}

export function buildPixelPointGeometry(lng: number, lat: number): GeoJSON.Point {
  return { type: 'Point', coordinates: [lng, lat] }
}

/** Small polygon around a map click for zonal Sentinel statistics. */
export function buildSamplePolygonFromPoint(lng: number, lat: number, halfSizeM = 15): GeoJSON.Polygon {
  const dLat = halfSizeM / 111_320
  const cosLat = Math.cos((lat * Math.PI) / 180) || 1e-6
  const dLng = halfSizeM / (111_320 * cosLat)
  return {
    type: 'Polygon',
    coordinates: [
      [
        [lng - dLng, lat - dLat],
        [lng + dLng, lat - dLat],
        [lng + dLng, lat + dLat],
        [lng - dLng, lat + dLat],
        [lng - dLng, lat - dLat],
      ],
    ],
  }
}
