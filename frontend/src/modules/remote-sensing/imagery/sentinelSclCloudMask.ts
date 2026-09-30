/**
 * Unified Sentinel-2 L2A pixel-level cloud mask (SCL + Cloud Probability).
 * Layer Index display: cloud pixels fall back to the same scene's true-color RGB;
 * vegetation, soil, water, shadows and snow keep the computed index.
 * CLM is not used — the binary s2cloudless mask dilates cloud edges.
 */

/** Minimum AOI clear fraction (0–1) before a scene is marked unusable. */
export const SI_SENTINEL_MIN_AOI_CLEAR_FRACTION = 0.005

/** Never reject granules at WMS MAXCC — pixel masks gate analysis. */
export const SI_SENTINEL_WMS_MAXCC = 100

/**
 * SCL classes that are valid surfaces — never treated as cloud.
 * 2=dark, 3=shadow, 4=vegetation, 5=bare/soil, 6=water, 7=unclassified, 11=snow.
 */
export const SENTINEL_SCL_VALID_SURFACE_CLASSES = [2, 3, 4, 5, 6, 7, 11] as const

/** SCL cloud classes: 8=medium cloud, 9=high-probability cloud, 10=thin cirrus. */
export const SENTINEL_SCL_CLOUD_CLASSES = [8, 9, 10] as const

/** Cloud-probability threshold in 0–1 (s2cloudless CLP). */
export const SENTINEL_CLP_CLOUD_THRESHOLD = 0.55

function sclEqualsExpr(classes: readonly number[]): string {
  return classes.map(c => `scl == ${c}`).join(' || ')
}

/** Evalscript: normalize CLP from 0–255 DN or 0–1 reflectance-style to 0–1. */
export const SENTINEL_CLP_01_EXPR = `(s.CLP > 1.5 ? s.CLP / 255.0 : s.CLP)`

/**
 * Evalscript v3 expression: true only for cloud pixels (pixel-level, no dilation).
 * Valid surfaces stay false even when CLP/CLM would otherwise flag them.
 */
export const SENTINEL_SCL_CLOUD_MASK_EXPR = `!(${sclEqualsExpr(SENTINEL_SCL_VALID_SURFACE_CLASSES)}) && ((${sclEqualsExpr(SENTINEL_SCL_CLOUD_CLASSES)}) || ${SENTINEL_CLP_01_EXPR} >= ${SENTINEL_CLP_CLOUD_THRESHOLD})`

/** Normalize s2cloudless CLP (0–1 or 0–255) to 0–1. */
export function sentinelCloudProbability01(clp: number): number {
  if (!Number.isFinite(clp)) return 0
  return clp > 1.5 ? clp / 255 : clp
}

/**
 * Pixel-level cloud decision matching the Layer Index evalscript.
 * Shadows, vegetation, soil, water and snow are never clouds.
 */
export function isSentinelCloudPixel(scl: number, clp: number): boolean {
  const rounded = Math.round(scl)
  if ((SENTINEL_SCL_VALID_SURFACE_CLASSES as readonly number[]).includes(rounded)) return false
  if ((SENTINEL_SCL_CLOUD_CLASSES as readonly number[]).includes(rounded)) return true
  return sentinelCloudProbability01(clp) >= SENTINEL_CLP_CLOUD_THRESHOLD
}

/** Compact one-liner for evaluatePixel blocks. */
export function buildSentinelCloudMaskEvalscriptLine(sampleVar = 's'): string {
  return `var scl = Math.round(${sampleVar}.SCL);
  var cloud = ${SENTINEL_SCL_CLOUD_MASK_EXPR.replace(/s\./g, `${sampleVar}.`)};`
}

/** Early-return guard for WMS UINT8 zonal evalscripts. */
export function wmsCloudMaskGuardLines(sampleVar = 's'): string {
  return `${buildSentinelCloudMaskEvalscriptLine(sampleVar)}
  if (!${sampleVar}.dataMask || cloud) return [0, 0, 0, 0];`
}

/** AOI cloud-mask PNG evalscript (green=clear, red=cloud). */
export const SENTINEL_AOI_CLOUD_MASK_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["SCL", "CLP", "dataMask"] }],
    output: { bands: 4, sampleType: "UINT8" }
  };
}
function evaluatePixel(s) {
  ${buildSentinelCloudMaskEvalscriptLine('s')}
  if (!s.dataMask) return [0, 0, 0, 0];
  return cloud ? [255, 0, 0, 255] : [0, 255, 0, 255];
}`

export type AoiCloudMaskStats = {
  clearCount: number
  cloudCount: number
  maskedCount: number
  validCount: number
  aoiCloudCoverPct: number | null
  aoiClearCoverPct: number | null
}

/** Decode green=clear / red=cloud mask PNG into pixel counts and percentages. */
export function aoiCloudMaskStatsFromRgba(data: Uint8ClampedArray): AoiCloudMaskStats {
  let clear = 0
  let cloud = 0
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!
    const g = data[i + 1]!
    const a = data[i + 3]!
    if (a < 128) continue
    if (g > 200 && r < 80) clear += 1
    else if (r > 200 && g < 80) cloud += 1
  }
  const total = clear + cloud
  if (total === 0) {
    return {
      clearCount: 0,
      cloudCount: 0,
      maskedCount: 0,
      validCount: 0,
      aoiCloudCoverPct: null,
      aoiClearCoverPct: null,
    }
  }
  const aoiCloudCoverPct = Math.round((cloud / total) * 1000) / 10
  const aoiClearCoverPct = Math.round((clear / total) * 1000) / 10
  return {
    clearCount: clear,
    cloudCount: cloud,
    maskedCount: cloud,
    validCount: clear,
    aoiCloudCoverPct,
    aoiClearCoverPct,
  }
}

/** @deprecated Use aoiCloudMaskStatsFromRgba */
export function aoiCloudCoverPctFromMaskRgba(data: Uint8ClampedArray): number | null {
  return aoiCloudMaskStatsFromRgba(data).aoiCloudCoverPct
}

export type SentinelSceneCloudLogEntry = {
  sceneId: string
  acquisitionDate: string
  originalCloudCoverage: number | null
  aoiCloudPercentage: number | null
  aoiClearPercentage: number | null
  maskedPixelCount: number
  validPixelCount: number
  usable: boolean
  status: string
}

export function buildSentinelSceneCloudLogEntry(
  acquisitionDate: string,
  stats: AoiCloudMaskStats,
  options?: { sceneId?: string; originalCloudCoverage?: number | null },
): SentinelSceneCloudLogEntry {
  const clearFrac =
    stats.validCount + stats.maskedCount > 0
      ? stats.validCount / (stats.validCount + stats.maskedCount)
      : 0
  const usable = clearFrac >= SI_SENTINEL_MIN_AOI_CLEAR_FRACTION
  return {
    sceneId: options?.sceneId ?? acquisitionDate,
    acquisitionDate,
    originalCloudCoverage:
      options?.originalCloudCoverage != null && Number.isFinite(options.originalCloudCoverage)
        ? options.originalCloudCoverage
        : null,
    aoiCloudPercentage: stats.aoiCloudCoverPct,
    aoiClearPercentage: stats.aoiClearCoverPct,
    maskedPixelCount: stats.maskedCount,
    validPixelCount: stats.validCount,
    usable,
    status: usable
      ? stats.aoiClearCoverPct != null && stats.aoiClearCoverPct >= 80
        ? 'clear'
        : 'partial_cloud_masked'
      : 'no_clear_pixels',
  }
}

export function logSentinelSceneCloudMetrics(entry: SentinelSceneCloudLogEntry): void {
  console.info('[sentinel-s2-cloud]', {
    sceneId: entry.sceneId,
    acquisitionDate: entry.acquisitionDate,
    originalCloudCoverage: entry.originalCloudCoverage,
    aoiCloudPct: entry.aoiCloudPercentage,
    aoiClearPct: entry.aoiClearPercentage,
    maskedPixels: entry.maskedPixelCount,
    validPixels: entry.validPixelCount,
    status: entry.status,
    usable: entry.usable,
  })
}

/** Alpha suffix for analytical-only evalscripts — not used on visual WMS display layers. */
export function buildSentinelIndexCloudMaskAlphaBlock(
  dataMaskVar = 'samples.dataMask',
  sampleVar = 'samples',
): string {
  return `var scl = Math.round(${sampleVar}.SCL);
  var cloud = ${SENTINEL_SCL_CLOUD_MASK_EXPR.replace(/s\./g, `${sampleVar}.`)};
  var a = ${dataMaskVar} * (cloud ? 0.0 : 1.0);
  return imgVals.concat(a);`
}

/** Input bands for pixel-level SCL + CLP cloud detection (no CLM — it dilates edges). */
export const SENTINEL_CLOUD_MASK_INPUT_BANDS = ['SCL', 'CLP'] as const

/** Sentinel-2 L2A true-color display gain (reflectance × gain, clamped to 0–1). */
export const SENTINEL_TRUE_COLOR_GAIN = 2.5

/** Bands an index display evalscript needs to paint masked pixels with the scene's true color. */
export const SENTINEL_CLOUD_RGB_FALLBACK_INPUT_BANDS = [
  'B02',
  'B03',
  'B04',
  ...SENTINEL_CLOUD_MASK_INPUT_BANDS,
] as const

/**
 * Evalscript helpers for index display layers.
 * `cloudMasked(s)` is pixel-level SCL + CLP (no dilation / interpolation).
 * `trueColor(s)` returns the pixel exactly as the RGB layer renders it.
 * Snow is a valid surface (kept in the index); `maskSnow` is accepted for callers.
 */
export function buildSentinelCloudRgbFallbackFunctions(_options?: { maskSnow?: boolean }): string {
  const validSurface = sclEqualsExpr(SENTINEL_SCL_VALID_SURFACE_CLASSES)
  const sclCloud = sclEqualsExpr(SENTINEL_SCL_CLOUD_CLASSES)
  return `function cloudProb(s) {
  return s.CLP > 1.5 ? s.CLP / 255.0 : s.CLP;
}
function cloudMasked(s) {
  var scl = Math.round(s.SCL);
  if (${validSurface}) return false;
  if (${sclCloud}) return true;
  return cloudProb(s) >= ${SENTINEL_CLP_CLOUD_THRESHOLD};
}
function tc(v) { return Math.max(0, Math.min(1, v * ${SENTINEL_TRUE_COLOR_GAIN})); }
function trueColor(s) { return [tc(s.B04), tc(s.B03), tc(s.B02), 1]; }`
}

/** First lines of evaluatePixel: no-data → transparent, cloud → real RGB, else fall through to the index. */
export function sentinelCloudRgbFallbackGuardLines(sampleVar = 'samples'): string {
  return `if (!${sampleVar}.dataMask) return [0, 0, 0, 0];
  if (cloudMasked(${sampleVar})) return trueColor(${sampleVar});`
}
