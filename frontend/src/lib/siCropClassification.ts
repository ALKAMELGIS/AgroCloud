/**
 * Crop Classification — Sentinel-2 / HLS multi-temporal WMS layer (Satellite Intelligence).
 * API-oriented pipeline hooks; map display via temporal evalscript + AOI clip.
 */

import type { SentinelHubWmsLayerInfo } from './sentinelHubWmsLayers'
import { subtractDaysFromIso } from './siSentinelImageryDate'

export const CROP_CLASSIFICATION_LAYER_ID = 'CROP_CLASS'

export const CROP_CLASSIFICATION_WMS_LAYER: SentinelHubWmsLayerInfo = {
  name: CROP_CLASSIFICATION_LAYER_ID,
  title: 'Crop Classification',
}

export type CropClassificationClass = {
  id: number
  key: string
  name: string
  color: string
}

export const CROP_CLASSIFICATION_CLASSES: readonly CropClassificationClass[] = [
  { id: 1, key: 'corn', name: 'Corn', color: '#fbbf24' },
  { id: 2, key: 'soybeans', name: 'Soybeans', color: '#84cc16' },
  { id: 3, key: 'wheat', name: 'Wheat', color: '#eab308' },
  { id: 4, key: 'cotton', name: 'Cotton', color: '#e7e5e4' },
  { id: 5, key: 'alfalfa', name: 'Alfalfa', color: '#22c55e' },
  { id: 6, key: 'forest', name: 'Forest / Natural Vegetation', color: '#166534' },
  { id: 7, key: 'wetlands', name: 'Wetlands', color: '#0d9488' },
  { id: 8, key: 'urban', name: 'Urban / Barren', color: '#78716c' },
  { id: 9, key: 'water', name: 'Water', color: '#2563eb' },
] as const

export type CropClassificationToolTab = 'classify' | 'regional'

export type CropClassificationSettings = {
  /** Layer visible on map after a successful Run. */
  active: boolean
  seasonStart: string
  seasonEnd: string
  cloudCoverMax: number
  lastRunAt: number | null
  statusMessage: string
  analysisStep: 1 | 2 | 3 | 4
  toolTab: CropClassificationToolTab
}

export const DEFAULT_CROP_CLASSIFICATION_SETTINGS: CropClassificationSettings = {
  active: false,
  seasonStart: '',
  seasonEnd: '',
  cloudCoverMax: 15,
  lastRunAt: null,
  statusMessage: '',
  analysisStep: 1,
  toolTab: 'classify',
}

export function isCropClassificationLayerId(layerName: string): boolean {
  return String(layerName || '').trim().toUpperCase() === CROP_CLASSIFICATION_LAYER_ID
}

/** Growing-season TIME window for temporal evalscript (3+ scenes inside range). */
export function resolveCropClassificationTimeWindow(
  seasonStart: string,
  seasonEnd: string,
  fallbackEndDate: string,
  lookbackDays = 120,
): { timeStart: string; timeEnd: string } {
  const end = String(seasonEnd || fallbackEndDate || '').trim().slice(0, 10)
  if (!end) return { timeStart: '', timeEnd: '' }
  const start = String(seasonStart || '').trim().slice(0, 10) || subtractDaysFromIso(end, lookbackDays)
  return { timeStart: start, timeEnd: end }
}

export function defaultCropClassificationSeason(endDate: string, lookbackDays = 120): {
  seasonStart: string
  seasonEnd: string
} {
  const end = String(endDate || '').trim().slice(0, 10)
  return {
    seasonEnd: end,
    seasonStart: subtractDaysFromIso(end, lookbackDays),
  }
}
