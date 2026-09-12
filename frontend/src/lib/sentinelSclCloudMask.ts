/**
 * Unified Sentinel-2 L2A pixel-level cloud mask (SCL + CLM + CLP).
 * Used for AOI cloud metrics and zonal statistics — visual WMS layers stay unmasked.
 */

/** Minimum AOI clear fraction (0–1) before a scene is marked unusable. */
export const SI_SENTINEL_MIN_AOI_CLEAR_FRACTION = 0.005

/** Never reject granules at WMS MAXCC — pixel masks gate analysis. */
export const SI_SENTINEL_WMS_MAXCC = 100

/**
 * Evalscript v3 expression: true when pixel should be masked (cloud / shadow / snow / CLM / CLP).
 * SCL: 0=nodata, 1=saturated, 3=shadow, 8=medium cloud, 9=high cloud, 10=thin cirrus, 11=snow.
 */
export const SENTINEL_SCL_CLOUD_MASK_EXPR = `(
  scl == 0 || scl == 1 || scl == 3 || scl == 8 || scl == 9 || scl == 10 || scl == 11
) || s.CLM == 1 || s.CLP > 25`

/** Compact one-liner for evaluatePixel blocks. */
export function buildSentinelCloudMaskEvalscriptLine(sampleVar = 's'): string {
  return `var scl = ${sampleVar}.SCL;
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
    input: [{ bands: ["SCL", "CLM", "CLP", "dataMask"] }],
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
  return `var scl = ${sampleVar}.SCL;
  var cloud = ${SENTINEL_SCL_CLOUD_MASK_EXPR.replace(/s\./g, `${sampleVar}.`)};
  var a = ${dataMaskVar} * (cloud ? 0.0 : 1.0);
  return imgVals.concat(a);`
}

/** Input bands to append for cloud-masked index evalscripts. */
export const SENTINEL_CLOUD_MASK_INPUT_BANDS = ['SCL', 'CLM', 'CLP'] as const
