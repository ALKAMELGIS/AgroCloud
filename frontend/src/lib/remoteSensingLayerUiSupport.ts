/**
 * UI-only filters for Remote Sensing layer pickers (Map AOI / Imagery Time Series).
 * Does not change WMS catalog or evalscript registration.
 */

import type { RemoteSensingLayerSelectGroup } from './agroCompositeIndices'
import { buildEvalscriptB64ForLayer, usesPresetSentinelHubWmsLayer } from './sentinelHubWmsAoiClip'
import {
  getSentinelHubWmsLayerCatalog,
  resolveSentinelHubWmsNativeIndexLayerName,
  usesSentinelHubWmsCustomEvalscript,
} from './sentinelHubWmsLayers'

/** True when the layer can be painted on Map canvas AOI (WMS clip / evalscript path). */
export function isRemoteSensingLayerSupportedOnAoiWms(layerId: string): boolean {
  const id = String(layerId || '').trim()
  if (!id) return false
  const upper = id.toUpperCase()

  if (usesPresetSentinelHubWmsLayer(id)) return true

  const catalog = getSentinelHubWmsLayerCatalog()
  if (resolveSentinelHubWmsNativeIndexLayerName(id, catalog)) return true

  if (buildEvalscriptB64ForLayer(id) != null) return true

  if (!usesSentinelHubWmsCustomEvalscript(upper)) {
    if (catalog.some(l => String(l.name || '').trim().toUpperCase() === upper)) return true
  }

  return false
}

export function filterRemoteSensingLayerSelectGroups(
  groups: RemoteSensingLayerSelectGroup[],
  isSupported: (layerId: string) => boolean,
): RemoteSensingLayerSelectGroup[] {
  const out: RemoteSensingLayerSelectGroup[] = []
  for (const group of groups) {
    const options = group.options.filter(opt => isSupported(opt.id))
    if (options.length) out.push({ ...group, options })
  }
  return out
}

export function filterRemoteSensingLayerSelectGroupsForAoiWms(
  groups: RemoteSensingLayerSelectGroup[],
): RemoteSensingLayerSelectGroup[] {
  return filterRemoteSensingLayerSelectGroups(groups, isRemoteSensingLayerSupportedOnAoiWms)
}

/** Layer ids that paint on the map via Sentinel Hub WMS + client evalscript (Show on map / Layers AOI). */
export function shouldAutoEnableRemoteSensingAoiMap(layerId: string): boolean {
  return isRemoteSensingLayerSupportedOnAoiWms(layerId)
}
