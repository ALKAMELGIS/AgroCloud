/**
 * AgroCloud LULC — Live Analysis land-cover layer (Satellite Intelligence).
 *
 * Class schema matches Esri / Impact Observatory Sentinel-2 10m Land Cover
 * (values 1,2,4,5,7,8,9,10,11 — 3 and 6 unused). Rendering uses AgroCloud’s
 * own Sentinel Hub evalscript, not the Esri ImageServer endpoint.
 */

import type { SentinelHubWmsLayerInfo } from './sentinelHubWmsLayers'
import { subtractDaysFromIso } from './siSentinelImageryDate'

export const LULC_CLASSIFICATION_LAYER_ID = 'LULC'

/** Native Sentinel-2 GSD (m). */
export const LULC_NATIVE_GSD_M = 10

/**
 * Analytical display target (m) — denser NEAREST tiles so class edges stay
 * crisp when zoomed to basemap ~3 m detail (native GSD remains 10 m).
 */
export const LULC_ANALYTICAL_DISPLAY_GSD_M = 3

/** WMS GetMap WIDTH/HEIGHT for LULC — denser than default index tiles. */
export const LULC_WMS_TILE_PIXELS = 1024

export const LULC_CLASSIFICATION_WMS_LAYER: SentinelHubWmsLayerInfo = {
  name: LULC_CLASSIFICATION_LAYER_ID,
  title: 'LULC',
}

export const LULC_SCIENTIFIC_NAME =
  'Land Use / Land Cover — Sentinel-2 10m · 3m display (AgroCloud · IO schema)'

export type LulcClassificationClass = {
  /** IO/Esri class value (0 = No Data). */
  id: number
  key: string
  name: string
  color: string
  /** True when class counts as agricultural for monitoring workflows. */
  agricultural?: boolean
}

/**
 * Discrete LULC legend — colors aligned to the AgroCloud / IO Live Analysis legend.
 * Values 3 and 6 are intentionally absent (IO schema).
 */
export const LULC_CLASSES: readonly LulcClassificationClass[] = [
  { id: 1, key: 'water', name: 'Water', color: '#419BDF' },
  { id: 2, key: 'trees', name: 'Trees', color: '#397D49' },
  {
    id: 4,
    key: 'flooded',
    name: 'Flooded Vegetation',
    color: '#7EC8A3',
    agricultural: true,
  },
  { id: 5, key: 'crops', name: 'Crops', color: '#F5C518', agricultural: true },
  { id: 7, key: 'built', name: 'Built Area', color: '#E53935' },
  { id: 8, key: 'bare', name: 'Bare Ground', color: '#E8DCC8' },
  { id: 9, key: 'snow', name: 'Snow/Ice', color: '#E8F4FC' },
  { id: 10, key: 'clouds', name: 'Clouds', color: '#9E9E9E' },
  { id: 11, key: 'rangeland', name: 'Rangeland', color: '#C4A574' },
  { id: 0, key: 'nodata', name: 'No Data', color: '#FFFFFF' },
] as const

/** Map classes used for area stats / charts (excludes No Data). */
export const LULC_MAP_CLASSES: readonly LulcClassificationClass[] = LULC_CLASSES.filter(
  c => c.id !== 0,
)

/** Classes used for agricultural / non-agricultural AOI assessment. */
export const LULC_AGRICULTURAL_CLASS_IDS = new Set(
  LULC_CLASSES.filter(c => c.agricultural).map(c => c.id),
)

/** Max scene dates for LULC class-area time series (class-share uses 1). */
export const LULC_CLASS_AREA_MAX_DATES = 4

/** Fast path — single mosaic scene for class-share (%) charts. */
export const LULC_CLASS_AREA_FAST_DATES = 1

/** Temporal lookback (days) for LULC mosaicking — matches map TIME window. */
export const LULC_HISTOGRAM_SEARCH_WINDOW_DAYS = 120

/** Cap WMS GetMap size for class-area counts (speed vs precision). */
export const LULC_CLASS_AREA_WMS_MAX_PX = 512

export function isLulcClassificationLayerId(layerName: string): boolean {
  return String(layerName || '').trim().toUpperCase() === LULC_CLASSIFICATION_LAYER_ID
}

export function isLulcAgriculturalClassId(classId: number): boolean {
  return LULC_AGRICULTURAL_CLASS_IDS.has(classId)
}

/** Hex → RGB 0–1 for evalscript color output. */
export function lulcClassRgb01(hex: string): [number, number, number] {
  const h = hex.replace('#', '').trim()
  const n = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  const v = Number.parseInt(n, 16)
  if (!Number.isFinite(v)) return [0, 0, 0]
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]
}

export function resolveLulcClassById(classId: number): LulcClassificationClass | undefined {
  return LULC_CLASSES.find(c => c.id === classId)
}

/** Temporal TIME window for multi-orbit LULC mosaicking (default 120 days). */
export function resolveLulcClassificationTimeWindow(
  endDate: string,
  lookbackDays = 120,
): { timeStart: string; timeEnd: string } {
  const end = String(endDate || '').trim().slice(0, 10)
  if (!end) return { timeStart: '', timeEnd: '' }
  return { timeStart: subtractDaysFromIso(end, lookbackDays), timeEnd: end }
}
