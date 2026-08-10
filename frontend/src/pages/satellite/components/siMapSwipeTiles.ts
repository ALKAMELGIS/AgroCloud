/**
 * Lightweight MapSwipe helpers — tile URL build for before/after panels.
 * Isolated from SI WMS ping-pong / AOI imperative stack.
 */

import { buildSentinelLayerLiveWmsTileSpecs } from '../../../lib/sentinelLayerLiveWmsEngine'
import { subtractDaysFromIso } from '../../../lib/siSentinelImageryDate'

/** dates = same layer · two dates · layers = same date · two layers · both = independent layer+date each side */
export type SiMapSwipeMode = 'dates' | 'layers' | 'both'

export type SiMapSwipeSideConfig = {
  layerId: string
  sceneDate: string
}

export function defaultSwipeBeforeDate(afterIso: string, lookbackDays = 14): string {
  const end = String(afterIso || '').trim().slice(0, 10)
  if (!end) return ''
  return subtractDaysFromIso(end, lookbackDays)
}

/** Build WMS raster tile URLs for one swipe side (requires AOI clip). */
export function buildSiMapSwipeTileUrls(options: {
  clipSource: unknown
  layerId: string
  sceneDate: string
  cloudCoverage?: number
}): string[] {
  const layerId = String(options.layerId || '').trim()
  const sceneDate = String(options.sceneDate || '').trim().slice(0, 10)
  if (!layerId || !sceneDate || !options.clipSource) return []
  try {
    return buildSentinelLayerLiveWmsTileSpecs({
      clipSource: options.clipSource,
      wmsLayerName: layerId,
      analysisDate: sceneDate,
      cloudCoverage: options.cloudCoverage ?? 20,
    }).map(s => s.url)
  } catch {
    return []
  }
}
