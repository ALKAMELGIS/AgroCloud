import { inferWmsEvalProfile } from '../imagery/sentinelHubWmsAoiClip'
import { isSentinelIndexColorRampProfile } from './sentinelHubWmsIndexEvalscripts'

export type LayerLegendCloudCoverPct = {
  cloudPct: number | null
  clearPct: number | null
}

export type LayerLegendCloudCoverAreas = {
  cloudPct: number
  clearPct: number
  cloudAreaM2: number
  clearAreaM2: number
  aoiAreaM2: number
}

/** Index layers that apply the SCL+CLP cloud mask on the live WMS stack. */
export function layerLegendSupportsCloudCoverStats(layerId: string | undefined): boolean {
  if (!layerId?.trim()) return false
  return isSentinelIndexColorRampProfile(inferWmsEvalProfile(layerId))
}

/** Geodesic AOI area × mask percentages (same cloud definition as the live index layer). */
export function computeLayerLegendCloudCoverAreas(
  aoiAreaM2: number,
  cover: LayerLegendCloudCoverPct | null | undefined,
): LayerLegendCloudCoverAreas | null {
  if (!cover || !Number.isFinite(aoiAreaM2) || aoiAreaM2 <= 0) return null
  const cloudPct = cover.cloudPct
  if (cloudPct == null || !Number.isFinite(cloudPct) || cloudPct <= 0) return null
  const cloud = Math.max(0, Math.min(100, cloudPct))
  const clear =
    cover.clearPct != null && Number.isFinite(cover.clearPct)
      ? Math.max(0, Math.min(100, cover.clearPct))
      : Math.max(0, 100 - cloud)
  const cloudFrac = cloud / 100
  const clearFrac = clear / 100
  return {
    cloudPct: cloud,
    clearPct: clear,
    cloudAreaM2: aoiAreaM2 * cloudFrac,
    clearAreaM2: aoiAreaM2 * clearFrac,
    aoiAreaM2,
  }
}
