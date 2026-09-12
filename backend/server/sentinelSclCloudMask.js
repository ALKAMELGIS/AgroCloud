/**
 * Unified Sentinel-2 L2A pixel-level cloud mask (SCL + CLM + CLP).
 * Mirrors frontend/src/lib/sentinelSclCloudMask.ts for Node WMS statistics.
 */

/** Minimum AOI clear fraction before a scene is unusable. */
export const SI_SENTINEL_MIN_AOI_CLEAR_FRACTION = 0.005

/** Never reject granules at WMS MAXCC — pixel masks gate analysis. */
export const SI_SENTINEL_WMS_MAXCC = 100

export const SENTINEL_SCL_CLOUD_MASK_EXPR = `(
  scl == 0 || scl == 1 || scl == 3 || scl == 8 || scl == 9 || scl == 10 || scl == 11
) || s.CLM == 1 || s.CLP > 25`

export function buildSentinelCloudMaskEvalscriptLines(sampleVar = 's') {
  return `var scl = ${sampleVar}.SCL;
  var cloud = ${SENTINEL_SCL_CLOUD_MASK_EXPR.replace(/s\./g, `${sampleVar}.`)};`
}

export const SENTINEL_AOI_CLOUD_MASK_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["SCL", "CLM", "CLP", "dataMask"] }],
    output: { bands: 4, sampleType: "UINT8" }
  };
}
function evaluatePixel(s) {
  ${buildSentinelCloudMaskEvalscriptLines('s')}
  if (!s.dataMask) return [0, 0, 0, 0];
  return cloud ? [255, 0, 0, 255] : [0, 255, 0, 255];
}`

export const SENTINEL_AOI_CLOUD_MASK_EVALSCRIPT_B64 = Buffer.from(
  SENTINEL_AOI_CLOUD_MASK_EVALSCRIPT,
  'utf8',
).toString('base64')

/**
 * @param {import('pngjs').PNG} png
 * @returns {{ clearCount: number; cloudCount: number; aoiCloudCoverPct: number | null; aoiClearCoverPct: number | null }}
 */
export function aoiCloudMaskStatsFromPng(png) {
  let clear = 0
  let cloud = 0
  const data = png.data
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const a = data[i + 3]
    if (a < 128) continue
    if (g > 200 && r < 80) clear += 1
    else if (r > 200 && g < 80) cloud += 1
  }
  const total = clear + cloud
  if (total === 0) {
    return { clearCount: 0, cloudCount: 0, aoiCloudCoverPct: null, aoiClearCoverPct: null }
  }
  return {
    clearCount: clear,
    cloudCount: cloud,
    aoiCloudCoverPct: Math.round((cloud / total) * 1000) / 10,
    aoiClearCoverPct: Math.round((clear / total) * 1000) / 10,
  }
}

/**
 * @param {string} acquisitionDate
 * @param {{ clearCount: number; cloudCount: number; aoiCloudCoverPct: number | null; aoiClearCoverPct: number | null }} stats
 * @param {{ sceneId?: string; originalCloudCoverage?: number | null }} [options]
 */
export function buildSentinelSceneCloudLogEntry(acquisitionDate, stats, options = {}) {
  const total = stats.clearCount + stats.cloudCount
  const clearFrac = total > 0 ? stats.clearCount / total : 0
  const usable = clearFrac >= SI_SENTINEL_MIN_AOI_CLEAR_FRACTION
  return {
    sceneId: options.sceneId ?? acquisitionDate,
    acquisitionDate,
    originalCloudCoverage:
      options.originalCloudCoverage != null && Number.isFinite(options.originalCloudCoverage)
        ? options.originalCloudCoverage
        : null,
    aoiCloudPercentage: stats.aoiCloudCoverPct,
    aoiClearPercentage: stats.aoiClearCoverPct,
    maskedPixelCount: stats.cloudCount,
    validPixelCount: stats.clearCount,
    usable,
    status: usable
      ? stats.aoiClearCoverPct != null && stats.aoiClearCoverPct >= 80
        ? 'clear'
        : 'partial_cloud_masked'
      : 'no_clear_pixels',
  }
}

export function logSentinelSceneCloudMetrics(entry) {
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

/** Shared cloud gate for WMS zonal / class-grid evalscripts. */
export function wmsCloudMaskGuard(sampleVar = 's') {
  return `${buildSentinelCloudMaskEvalscriptLines(sampleVar)}
  if (!${sampleVar}.dataMask || cloud) return [0, 0, 0, 0];`
}
