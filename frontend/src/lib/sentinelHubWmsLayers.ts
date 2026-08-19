/**
 * Sentinel Hub OGC WMS: layer list parsing and S2L1C resolution limits (~200 m/px).
 */

import {
  buildAgroCloudCustomWmsLayerEntries,
  isAgroCompositeLayerId,
  isAgroDeltaCompositeLayerId,
} from './agroCompositeIndices'
import { ADI_HISTORICAL_LOOKBACK_DAYS, isAdiLayerId } from './adiIndex'
import { NCADI_LOOKBACK_DAYS, isNcadiLayerId } from './ncadiIndex'
import { WAPI_LOOKBACK_DAYS, isWapiLayerId } from './wapiIndex'
import { CROP_CLASSIFICATION_WMS_LAYER, isCropClassificationLayerId } from './siCropClassification'
import {
  LULC_CLASSIFICATION_WMS_LAYER,
  LULC_WMS_TILE_PIXELS,
  isLulcClassificationLayerId,
} from './siLulcClassification'
import { resolvePreviousValidSceneDate } from './siAdaptiveTemporalEngine'
import { subtractDaysFromIso } from './siSentinelImageryDate'
import { getSentinelHubAccessToken } from './sentinelHubAccessToken'

/** Keep local — avoid circular import with agroCompositeIndices ↔ dataMaskLayer. */
const DATAMASK_LAYER_ID = 'DATAMASK'

function isDataMaskLayerId(layerName: string): boolean {
  const u = String(layerName || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
  return u === 'DATAMASK' || u === 'DATAMASKBAND' || u === 'DATA_MASK'
}

export type SentinelHubWmsLayerInfo = {
  name: string
  title: string
}

/** Sentinel-2 L1C collection max ground sampling distance for a single GetMap request. */
export const SENTINEL_HUB_S2_MAX_METERS_PER_PIXEL = 200

/** OGC WMS raster resampling — bilinear for smooth index layers (data-level, not CSS). */
export const SENTINEL_HUB_WMS_RASTER_RESAMPLE_PARAMS =
  '&UPSAMPLING=BILINEAR&DOWNSAMPLING=BILINEAR'

/** Categorical LULC / class maps — nearest keeps crisp class edges at ~3 m display zooms. */
export const SENTINEL_HUB_WMS_CATEGORICAL_RESAMPLE_PARAMS =
  '&UPSAMPLING=NEAREST&DOWNSAMPLING=NEAREST'

export const SENTINEL_HUB_WMS_TILE_PIXELS = 512

/** Resolve GetMap / MapLibre tile pixel size for a logical layer. */
export function resolveSentinelHubWmsTilePixels(layerName: string): number {
  if (isLulcClassificationLayerId(layerName)) return LULC_WMS_TILE_PIXELS
  return SENTINEL_HUB_WMS_TILE_PIXELS
}

/** Default Sentinel Live layer when Remote Sensing opens (title match from GetCapabilities). */
export const SI_DEFAULT_SENTINEL_WMS_LAYER_TITLE = 'NDVI'

/** Default Layer Live id — renders immediately on map canvas without waiting for GetCapabilities. */
export const SI_DEFAULT_LIVE_WMS_LAYER = 'NDVI'

const SI_DEFAULT_SENTINEL_WMS_TITLE_ALIASES = [
  SI_DEFAULT_SENTINEL_WMS_LAYER_TITLE,
  'Vegetation Index',
  'Normalized Difference Vegetation Index',
  'Highlight Optimized Natural Color',
  'Optimized Natural Color',
  'True Color',
] as const

const EARTH_CIRCUMFERENCE_METERS = 40_075_016.685_578_49

const SKIP_LAYER_NAME_RE = /^(sentinel\s*hub\s*wms|wms|root|default)$/i

function normalizeTitleKey(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
}

function layerRank(layer: SentinelHubWmsLayerInfo): number {
  let score = 0
  if (/^[0-9]+[-_.]/.test(layer.name)) score -= 2
  if (layer.name.includes('-')) score += 1
  if (layer.title.length > 0 && layer.title !== layer.name) score += 1
  return score
}

function pickPreferredLayer(
  a: SentinelHubWmsLayerInfo,
  b: SentinelHubWmsLayerInfo,
): SentinelHubWmsLayerInfo {
  return layerRank(a) >= layerRank(b) ? a : b
}

function collectLeafWmsLayers(layerEl: Element, out: SentinelHubWmsLayerInfo[]): void {
  const directChildLayers = Array.from(layerEl.children).filter(
    child => child.localName === 'Layer',
  )
  if (directChildLayers.length > 0) {
    directChildLayers.forEach(child => collectLeafWmsLayers(child, out))
    return
  }

  const name = (layerEl.getElementsByTagName('Name')[0]?.textContent || '').trim()
  if (!name || SKIP_LAYER_NAME_RE.test(name)) return

  let title = (layerEl.getElementsByTagName('Title')[0]?.textContent || name).trim()
  if (name === 'NDWI' && /Moisture Index \(NDWI\)/i.test(title)) title = 'NDWI'
  if (/^NDMI$/i.test(name) || /moisture\s*index/i.test(title) || /moisture\s*index/i.test(name)) {
    title = 'NDMI'
  }

  out.push({ name, title })
}

/**
 * Parse GetCapabilities XML: leaf layers only, dedupe by name and display title.
 */
export function parseSentinelHubWmsCapabilities(xml: Document): SentinelHubWmsLayerInfo[] {
  const raw: SentinelHubWmsLayerInfo[] = []
  const capabilityLayer =
    xml.querySelector('Capability > Layer') ?? xml.getElementsByTagName('Layer')[0]
  if (capabilityLayer) collectLeafWmsLayers(capabilityLayer, raw)

  const byName = new Map<string, SentinelHubWmsLayerInfo>()
  for (const layer of raw) {
    const key = layer.name.trim().toUpperCase()
    if (!key) continue
    const prev = byName.get(key)
    byName.set(key, prev ? pickPreferredLayer(prev, layer) : layer)
  }

  const byTitle = new Map<string, SentinelHubWmsLayerInfo>()
  for (const layer of byName.values()) {
    const titleKey = normalizeTitleKey(layer.title || layer.name)
    if (!titleKey) continue
    const prev = byTitle.get(titleKey)
    byTitle.set(titleKey, prev ? pickPreferredLayer(prev, layer) : layer)
  }

  return Array.from(byTitle.values()).sort((a, b) =>
    (a.title || a.name).localeCompare(b.title || b.name, undefined, { sensitivity: 'base' }),
  )
}

/** Pick the default Remote Sensing WMS layer (NDVI first, then title aliases). */
export function pickDefaultSentinelWmsLayer(
  layers: SentinelHubWmsLayerInfo[],
  preferredTitle = SI_DEFAULT_SENTINEL_WMS_LAYER_TITLE,
): string {
  if (!layers.length) return ''

  const nativeNdvi = resolveSentinelHubWmsNativeIndexLayerName('NDVI', layers)
  if (nativeNdvi) return nativeNdvi

  const ndviExact = layers.find(l => String(l.name || '').trim().toUpperCase() === 'NDVI')
  if (ndviExact) return ndviExact.name

  const want = normalizeTitleKey(preferredTitle)
  const exact = layers.find(
    l => normalizeTitleKey(l.title || l.name) === want || l.name === preferredTitle,
  )
  if (exact) return exact.name

  for (const alias of SI_DEFAULT_SENTINEL_WMS_TITLE_ALIASES) {
    const key = normalizeTitleKey(alias)
    const hit = layers.find(l => {
      const t = normalizeTitleKey(l.title || l.name)
      return t === key || t.includes(key) || key.includes(t)
    })
    if (hit) return hit.name
  }

  const highlight = layers.find(l => /highlight/i.test(l.title) && /natural/i.test(l.title))
  if (highlight) return highlight.name

  return layers[0]!.name
}

/** Append Sentinel Hub `access_token` for OGC WMS GetCapabilities / GetMap (GitHub Pages has no build-time env). */
export function appendSentinelHubWmsAccessToken(url: string, accessToken = getSentinelHubAccessToken()): string {
  const token = accessToken.trim()
  if (!token) return url
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}access_token=${encodeURIComponent(token)}`
}

/**
 * Minimum map zoom so 512×512 WMS tiles stay at or below {@link SENTINEL_HUB_S2_MAX_METERS_PER_PIXEL}.
 */
export function sentinelHubWmsMinZoomForLatitude(
  latDeg: number,
  tilePixels = SENTINEL_HUB_WMS_TILE_PIXELS,
  maxMetersPerPixel = SENTINEL_HUB_S2_MAX_METERS_PER_PIXEL,
): number {
  const cosLat = Math.max(0.12, Math.cos((latDeg * Math.PI) / 180))
  const zoom = Math.log2(
    (EARTH_CIRCUMFERENCE_METERS * cosLat) / (tilePixels * maxMetersPerPixel),
  )
  return Math.max(0, Math.ceil(zoom))
}

export function buildSentinelHubWmsGetMapUrlParts(options: {
  baseUrl: string
  layer: string
  timeStart: string
  timeEnd: string
  cloudCoverage: number
  geometryWkt3857?: string
  evalscriptB64?: string
  tilePixels?: number
  /** Prefer NEAREST for categorical LULC / class rasters. */
  categorical?: boolean
}): string {
  const safeLayer = encodeURIComponent(options.layer)
  const px = options.tilePixels ?? SENTINEL_HUB_WMS_TILE_PIXELS
  const resample = options.categorical
    ? SENTINEL_HUB_WMS_CATEGORICAL_RESAMPLE_PARAMS
    : SENTINEL_HUB_WMS_RASTER_RESAMPLE_PARAMS
  let url =
    `${options.baseUrl}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0` +
    `&LAYERS=${safeLayer}` +
    `&BBOX={bbox-epsg-3857}&CRS=EPSG:3857` +
    `&FORMAT=image/png&TRANSPARENT=true&WIDTH=${px}&HEIGHT=${px}` +
    `&TIME=${options.timeStart}/${options.timeEnd}` +
    `&MAXCC=${options.cloudCoverage}` +
    resample +
    `&SHOWLOGO=false&WARNINGS=false`
  if (options.geometryWkt3857) {
    url += `&GEOMETRY=${encodeURIComponent(options.geometryWkt3857)}`
  }
  if (options.evalscriptB64) {
    url += `&EVALSCRIPT=${encodeURIComponent(options.evalscriptB64)}`
  }
  return appendSentinelHubWmsAccessToken(url)
}

/** Custom AgroCloud index layers (evalscript applied via GEOMETRY clip). */
export const AGRO_CLOUD_CUSTOM_WMS_LAYERS: readonly SentinelHubWmsLayerInfo[] =
  buildAgroCloudCustomWmsLayerEntries() ?? []

const AGRO_CLOUD_CUSTOM_WMS_LAYER_IDS = new Set(
  (AGRO_CLOUD_CUSTOM_WMS_LAYERS ?? []).map(l => String(l.name || '').trim().toUpperCase()),
)

/** Layers injected client-side — not native Sentinel Hub WMS layer ids. */
export function isAgroCloudCustomWmsLayer(layerName: string): boolean {
  return AGRO_CLOUD_CUSTOM_WMS_LAYER_IDS.has(String(layerName || '').trim().toUpperCase())
}

function findSentinelHubWmsLayerByToken(
  availableLayers: SentinelHubWmsLayerInfo[],
  token: string,
): string | undefined {
  const upper = token.toUpperCase()
  return availableLayers.find(
    l =>
      String(l.name || '').toUpperCase().includes(upper) ||
      String(l.title || '').toUpperCase().includes(upper),
  )?.name
}

/**
 * Band-rich Sentinel layer for GetMap when EVALSCRIPT computes indices from raw bands.
 * Prefer TRUE_COLOR over index presets (NDVI layer may not expose all bands to custom scripts).
 */
export function resolveSentinelHubWmsEvalscriptProxyLayerName(
  availableLayers: SentinelHubWmsLayerInfo[],
): string {
  return (
    findSentinelHubWmsLayerByToken(availableLayers, '1_TRUE_COLOR') ??
    findSentinelHubWmsLayerByToken(availableLayers, '1-TRUE-COLOR') ??
    findSentinelHubWmsLayerByToken(availableLayers, 'TRUE-COLOR') ??
    findSentinelHubWmsLayerByToken(availableLayers, 'TRUE_COLOR') ??
    findSentinelHubWmsLayerByToken(availableLayers, '1-0-0') ??
    findSentinelHubWmsLayerByToken(availableLayers, 'SENTINEL-2') ??
    findSentinelHubWmsLayerByToken(availableLayers, 'NDVI') ??
    availableLayers[0]?.name ??
    '1_TRUE_COLOR'
  )
}

const NATIVE_INDEX_LAYER_PATTERNS: Partial<Record<string, RegExp>> = {
  NDVI: /NDVI/i,
  NDMI: /NDMI|MOISTURE/i,
  NDII: /NDII/i,
  NDWI: /NDWI|WATER/i,
  SAVI: /SAVI/i,
  CHAS: /CHAS/i,
}

/** Instance-native Sentinel Hub preset ids (e.g. 3_NDVI) — not legacy aliases like NDVI. */
export function isSentinelHubInstanceNativeWmsLayerName(name: string): boolean {
  return /^\d+[_-]/.test(String(name || '').trim())
}

/** Resolve instance-native Sentinel Hub WMS layer id (e.g. 3_NDVI) for AOI GEOMETRY clip without client evalscript. */
export function resolveSentinelHubWmsNativeIndexLayerName(
  logicalLayerName: string,
  availableLayers: SentinelHubWmsLayerInfo[],
): string | null {
  const upper = String(logicalLayerName || '').trim().toUpperCase()
  if (!upper) return null

  // Layer Live NDVI uses SCL-masked 10-class client evalscript (B8A) — not preset 3_NDVI ramp.
  if (upper === 'NDVI') return null

  const pattern = NATIVE_INDEX_LAYER_PATTERNS[upper as keyof typeof NATIVE_INDEX_LAYER_PATTERNS]
  if (!pattern) return null

  const candidates = availableLayers.filter(l => {
    const name = String(l.name || '').trim()
    if (!name || isAgroCloudCustomWmsLayer(name)) return false
    if (!isSentinelHubInstanceNativeWmsLayerName(name)) return false
    return pattern.test(name) || pattern.test(String(l.title || ''))
  })

  candidates.sort((a, b) => a.name.localeCompare(b.name))
  return candidates[0]?.name ?? null
}

/** True when GetMap must use a band proxy + client EVALSCRIPT (no instance-native index layer). */
export function usesSentinelHubWmsClientEvalscript(
  logicalLayerName: string,
  availableLayers: SentinelHubWmsLayerInfo[] = getSentinelHubWmsLayerCatalog(),
): boolean {
  if (resolveSentinelHubWmsNativeIndexLayerName(logicalLayerName, availableLayers)) return false
  return usesSentinelHubWmsCustomEvalscript(logicalLayerName)
}

/** Core interpretation layers always rendered via client EVALSCRIPT on a band proxy. */
const CORE_INTERPRETATION_WMS_IDS = new Set([
  'NDVI',
  'NDMI',
  'NDII',
  'NDWI',
  'MNDWI',
  'AWEI',
  'NBR',
  'SAVI',
  'ET',
  'LST',
  'DATAMASK',
])

export function usesSentinelHubWmsCustomEvalscript(layerName: string): boolean {
  const upper = String(layerName || '').trim().toUpperCase()
  if (!upper) return false
  if (isDataMaskLayerId(upper)) return true
  if (isCropClassificationLayerId(upper)) return true
  if (isLulcClassificationLayerId(upper)) return true
  if (isAgroCloudCustomWmsLayer(upper)) return true
  if (CORE_INTERPRETATION_WMS_IDS.has(upper)) return true
  if (isAgroCompositeLayerId(upper) || isAgroDeltaCompositeLayerId(upper)) return true
  return false
}

/**
 * Minimal layer catalog for instant Layer Live (NDVI + composites + TRUE_COLOR proxy).
 * GetCapabilities merges in the background without blocking the map overlay.
 */
export function getBootstrapSentinelWmsLayers(): SentinelHubWmsLayerInfo[] {
  return mergeAgroCloudCustomWmsLayers([
    { name: '1_TRUE_COLOR', title: 'True Color' },
    { name: '3_NDVI', title: 'Normalized Difference Vegetation Index' },
    { name: '2_FALSE_COLOR', title: 'False Color' },
    { name: 'TRUE_COLOR', title: 'True Color (legacy alias)' },
    { name: 'NDVI', title: 'NDVI (legacy alias)' },
    { name: 'NDMI', title: 'Normalized Difference Moisture Index' },
    { name: 'NDII', title: 'Normalized Difference Infrared Index' },
    { name: 'NDWI', title: 'Normalized Difference Water Index' },
    { name: 'MNDWI', title: 'Modified Normalized Difference Water Index' },
    { name: 'AWEI', title: 'Automated Water Extraction Index' },
    { name: 'NBR', title: 'Normalized Burn Ratio' },
    { name: 'SAVI', title: 'Soil-Adjusted Vegetation Index' },
    { name: 'ET', title: 'Evapotranspiration' },
    { name: 'LST', title: 'Land Surface Temperature' },
    { name: DATAMASK_LAYER_ID, title: 'DataMask' },
  ])
}

/** Unified catalog: bootstrap native ids (3_NDVI, 1_TRUE_COLOR) merged with optional GetCapabilities. */
export function getSentinelHubWmsLayerCatalog(
  capabilitiesLayers?: SentinelHubWmsLayerInfo[] | null,
): SentinelHubWmsLayerInfo[] {
  const bootstrap = getBootstrapSentinelWmsLayers()
  if (!capabilitiesLayers?.length) return bootstrap

  const byName = new Map<string, SentinelHubWmsLayerInfo>()
  for (const layer of bootstrap) {
    const key = String(layer.name || '').trim().toUpperCase()
    if (key) byName.set(key, layer)
  }
  for (const layer of capabilitiesLayers) {
    const key = String(layer.name || '').trim().toUpperCase()
    if (key) byName.set(key, layer)
  }
  return mergeAgroCloudCustomWmsLayers(Array.from(byName.values()))
}

/** Append custom indices missing from Sentinel Hub GetCapabilities. */
export function mergeAgroCloudCustomWmsLayers(
  layers: SentinelHubWmsLayerInfo[],
): SentinelHubWmsLayerInfo[] {
  const names = new Set(layers.map(l => String(l.name || '').trim().toUpperCase()))
  const extra = [
    ...AGRO_CLOUD_CUSTOM_WMS_LAYERS.filter(l => !names.has(String(l.name || '').trim().toUpperCase())),
    ...(names.has(CROP_CLASSIFICATION_WMS_LAYER.name.toUpperCase()) ? [] : [CROP_CLASSIFICATION_WMS_LAYER]),
    ...(names.has(LULC_CLASSIFICATION_WMS_LAYER.name.toUpperCase()) ? [] : [LULC_CLASSIFICATION_WMS_LAYER]),
  ]
  if (!extra.length) return layers
  return [...layers, ...extra]
}

/**
 * Resolve OGC LAYERS= for GetMap.
 * Custom / core interpretation layers use a band-rich proxy + client EVALSCRIPT.
 */
export function resolveSentinelHubWmsGetMapLayerName(
  logicalLayerName: string,
  availableLayers: SentinelHubWmsLayerInfo[],
): string {
  const want = String(logicalLayerName || '').trim()
  if (!want) return want
  const upper = want.toUpperCase()

  // DATAMASK must use a band-rich TRUE_COLOR proxy — never an index preset.
  if (isDataMaskLayerId(upper)) {
    return resolveSentinelHubWmsEvalscriptProxyLayerName(availableLayers)
  }

  const nativeLayer = resolveSentinelHubWmsNativeIndexLayerName(want, availableLayers)
  if (nativeLayer) return nativeLayer

  if (usesSentinelHubWmsCustomEvalscript(upper)) {
    return resolveSentinelHubWmsEvalscriptProxyLayerName(availableLayers)
  }

  if (availableLayers.some(l => String(l.name || '').trim().toUpperCase() === upper)) {
    return want
  }

  return resolveSentinelHubWmsEvalscriptProxyLayerName(availableLayers)
}

/** Default WMS TIME= lookback so Sentinel Hub can pick the best scene (single-day often returns empty PNG). */
export const SENTINEL_HUB_WMS_LAYER_LIVE_LOOKBACK_DAYS = 30

/** TIME window for WMS GetMap — delta layers span previous → current scene; others use lookback ending on currentDate. */
export function resolveSentinelHubWmsTimeWindow(
  logicalLayerName: string,
  currentDate: string,
  previousDate: string | null,
  options?: { lookbackDays?: number },
): { timeStart: string; timeEnd: string } {
  const current = String(currentDate || '').trim().slice(0, 10)
  if (!current) return { timeStart: '', timeEnd: '' }
  if (isCropClassificationLayerId(logicalLayerName)) {
    const days = options?.lookbackDays ?? 120
    return {
      timeStart: subtractDaysFromIso(current, days),
      timeEnd: current,
    }
  }
  if (isLulcClassificationLayerId(logicalLayerName)) {
    const days = options?.lookbackDays ?? 120
    return {
      timeStart: subtractDaysFromIso(current, days),
      timeEnd: current,
    }
  }
  if (isAdiLayerId(logicalLayerName)) {
    const days = options?.lookbackDays ?? ADI_HISTORICAL_LOOKBACK_DAYS
    return {
      timeStart: subtractDaysFromIso(current, days),
      timeEnd: current,
    }
  }
  if (isNcadiLayerId(logicalLayerName)) {
    if (previousDate && previousDate.trim() && previousDate.trim() !== current) {
      return { timeStart: previousDate.trim(), timeEnd: current }
    }
    const days = options?.lookbackDays ?? NCADI_LOOKBACK_DAYS
    return {
      timeStart: subtractDaysFromIso(current, days),
      timeEnd: current,
    }
  }
  if (isWapiLayerId(logicalLayerName)) {
    if (previousDate && previousDate.trim() && previousDate.trim() !== current) {
      return { timeStart: previousDate.trim(), timeEnd: current }
    }
    const days = options?.lookbackDays ?? WAPI_LOOKBACK_DAYS
    return {
      timeStart: subtractDaysFromIso(current, days),
      timeEnd: current,
    }
  }
  if (
    isAgroDeltaCompositeLayerId(logicalLayerName) &&
    previousDate &&
    previousDate.trim() &&
    previousDate.trim() !== current
  ) {
    return { timeStart: previousDate.trim(), timeEnd: current }
  }
  const days = options?.lookbackDays ?? SENTINEL_HUB_WMS_LAYER_LIVE_LOOKBACK_DAYS
  return {
    timeStart: subtractDaysFromIso(current, days),
    timeEnd: current,
  }
}

/** Resolve a distinct previous scene date for delta WMS TIME=from/to. */
export function resolveSentinelHubWmsDeltaPreviousDate(
  currentDate: string,
  options: {
    autoPreviousSceneDate?: string | null
    catalogSceneIsos?: string[]
    timeSeriesStart?: string | null
    calendarFallbackDays?: number
  } = {},
): string | null {
  const current = String(currentDate || '').trim().slice(0, 10)
  if (!current) return null

  const auto = String(options.autoPreviousSceneDate || '').trim().slice(0, 10)
  if (auto && auto !== current) return auto

  const fromCatalog = resolvePreviousValidSceneDate(current, options.catalogSceneIsos ?? [])
  if (fromCatalog && fromCatalog !== current) return fromCatalog

  const tsStart = String(options.timeSeriesStart || '').trim().slice(0, 10)
  if (tsStart && tsStart !== current && tsStart < current) return tsStart

  const days = options.calendarFallbackDays ?? 7
  const d = new Date(`${current}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  d.setUTCDate(d.getUTCDate() - days)
  const fallback = d.toISOString().slice(0, 10)
  return fallback !== current ? fallback : null
}
