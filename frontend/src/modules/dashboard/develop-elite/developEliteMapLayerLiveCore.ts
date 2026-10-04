import {
  buildRemoteSensingLayerSelectGroups,
  type RemoteSensingLayerSelectGroup,
} from '@/modules/remote-sensing/indices/agroCompositeIndices'
import { extractOuterRingsWgs84 } from '@/modules/remote-sensing/imagery/sentinelHubWmsAoiClip'
import {
  buildSiSentinelAoiWmsStackState,
  resolveSiSentinelAoiWmsBoundsLngLat,
  type SiSentinelAoiWmsStackState,
} from '@/modules/remote-sensing/imagery/siSentinelAoiWmsStack'
import { SI_SENTINEL_WMS_SCENE_MAXCC } from '@/modules/remote-sensing/imagery/siSentinelAoiSceneCloudFilter'
import { getSentinelHubWmsBaseUrl } from '@/modules/remote-sensing/imagery/sentinelHubWmsInstance'
import {
  appendSentinelHubWmsAccessToken,
  getSentinelHubWmsLayerCatalog,
  mergeAgroCloudCustomWmsLayers,
  parseSentinelHubWmsCapabilities,
  SI_DEFAULT_LIVE_WMS_LAYER,
  type SentinelHubWmsLayerInfo,
} from '@/modules/remote-sensing/imagery/sentinelHubWmsLayers'
import { filterRemoteSensingLayerSelectGroupsForAoiWms } from '@/modules/remote-sensing/imagery/remoteSensingLayerUiSupport'
import {
  localIsoDate,
  SI_SENTINEL_FALLBACK_LATEST_SCENE_LAG_DAYS,
} from '@/modules/remote-sensing/imagery/siSentinelImageryDate'

export const DEVELOP_ELITE_LAYER_LIVE_PANE = 'develop-elite-layer-live'

export const DEVELOP_ELITE_LAYER_LIVE_WMS_ID_PREFIX = 'develop-elite-layer-live'

/** Above vector overlays (400) and draw sketch (360); below popups (700). */
export const DEVELOP_ELITE_LAYER_LIVE_PANE_Z_INDEX = 550

/** Scene ranking / WMS MAXCC preference for Develop Elite Layer Live (matches SI toolbox default intent). */
export const DEVELOP_ELITE_LAYER_LIVE_DEFAULT_CLOUD_COVERAGE = 10

export function developEliteDefaultImageryIsoDate(): string {
  const d = new Date()
  d.setDate(d.getDate() - SI_SENTINEL_FALLBACK_LATEST_SCENE_LAG_DAYS)
  return localIsoDate(d)
}

export function developEliteLayerLiveSelectOptions(
  groups: RemoteSensingLayerSelectGroup[],
): Array<{ id: string; label: string }> {
  return groups.flatMap(group =>
    (group.options ?? []).map(option => ({
      id: option.id,
      label: option.label || option.id,
    })),
  )
}

export function buildDevelopEliteLayerLiveLayerGroups(
  catalog: SentinelHubWmsLayerInfo[],
): RemoteSensingLayerSelectGroup[] {
  return filterRemoteSensingLayerSelectGroupsForAoiWms(buildRemoteSensingLayerSelectGroups(catalog)).filter(
    g => (g.options?.length ?? 0) > 0,
  )
}

export async function fetchDevelopEliteSentinelWmsCatalog(signal?: AbortSignal): Promise<SentinelHubWmsLayerInfo[]> {
  const baseUrl = getSentinelHubWmsBaseUrl()
  const response = await fetch(
    appendSentinelHubWmsAccessToken(`${baseUrl}?SERVICE=WMS&REQUEST=GetCapabilities`),
    { signal },
  )
  if (!response.ok) return getSentinelHubWmsLayerCatalog()
  const text = await response.text()
  const xml = new DOMParser().parseFromString(text, 'application/xml')
  const parsed = mergeAgroCloudCustomWmsLayers(parseSentinelHubWmsCapabilities(xml))
  return getSentinelHubWmsLayerCatalog(parsed.length ? parsed : null)
}

/** Layer Live on Develop Elite map: only the user-drawn AOI (no portfolio / structures fallback). */
export function resolveDevelopEliteLayerLiveClipSource(
  primary: unknown,
  _fallback: unknown,
  _layerId: string,
): unknown {
  if (primary == null || extractOuterRingsWgs84(primary).length === 0) return null
  return primary
}

export function developEliteLayerLiveHasDrawnAoiClip(primary: unknown): boolean {
  return extractOuterRingsWgs84(primary).length > 0
}

export type DevelopEliteLayerLiveTilePlan = {
  url: string
  boundsLngLat: [number, number, number, number] | null
}

function developEliteLayerLiveMaskCacheKey(clipSource: unknown, layerId: string, iso: string): string {
  const rings = extractOuterRingsWgs84(clipSource)
  const ringSig = rings
    .map(ring => ring.map(([lng, lat]) => `${lng.toFixed(5)},${lat.toFixed(5)}`).join(';'))
    .join('|')
  return `de-layer-live:${layerId}:${iso}:${ringSig.slice(0, 1200)}`
}

/** Same Sentinel draw-AOI WMS stack as Satellite Intelligence (GEOMETRY + dataMask evalscript). */
export function buildDevelopEliteLayerLiveWmsStack(options: {
  layerId: string
  isoDate: string
  clipSource: unknown
  cloudCoverage?: number
}): SiSentinelAoiWmsStackState {
  const layerId = String(options.layerId || SI_DEFAULT_LIVE_WMS_LAYER).trim() || SI_DEFAULT_LIVE_WMS_LAYER
  const iso = String(options.isoDate || '').trim().slice(0, 10)
  // WMS GetMap always uses granule MAXCC=100; UI cloud slider is for scene ranking only (SI parity).
  const maxCc = SI_SENTINEL_WMS_SCENE_MAXCC

  if (!iso || !options.clipSource) {
    return buildSiSentinelAoiWmsStackState(DEVELOP_ELITE_LAYER_LIVE_WMS_ID_PREFIX, {
      clipSource: options.clipSource ?? null,
      maskCacheKey: '',
      sessionKey: '',
      activeWmsLayer: layerId,
      sentinelFetchDate: iso,
      wmsTimeWindowKey: iso,
      effectiveWmsCloudCoverage: maxCc,
      autoPreviousSceneDate: null,
      catalogSceneIsos: [],
      timeSeriesStart: iso,
      cropSeasonStart: iso,
      cropSeasonEnd: iso,
      indexVisibilityMin: null,
      maxTileLayers: 12,
      preferSingleRingChunks: true,
    })
  }

  return buildSiSentinelAoiWmsStackState(DEVELOP_ELITE_LAYER_LIVE_WMS_ID_PREFIX, {
    clipSource: options.clipSource,
    maskCacheKey: developEliteLayerLiveMaskCacheKey(options.clipSource, layerId, iso),
    sessionKey: `${layerId}:${iso}`,
    activeWmsLayer: layerId,
    sentinelFetchDate: iso,
    wmsTimeWindowKey: iso,
    effectiveWmsCloudCoverage: maxCc,
    autoPreviousSceneDate: null,
    catalogSceneIsos: [],
    timeSeriesStart: iso,
    cropSeasonStart: iso,
    cropSeasonEnd: iso,
    indexVisibilityMin: null,
    maxTileLayers: 12,
    preferSingleRingChunks: true,
  })
}

export function buildDevelopEliteLayerLiveTilePlans(options: {
  layerId: string
  isoDate: string
  clipSource: unknown
  catalog?: SentinelHubWmsLayerInfo[]
  cloudCoverage?: number
}): DevelopEliteLayerLiveTilePlan[] {
  const stack = buildDevelopEliteLayerLiveWmsStack({
    layerId: options.layerId,
    isoDate: options.isoDate,
    clipSource: options.clipSource,
    cloudCoverage: options.cloudCoverage,
  })
  if (!stack.renderReady || !stack.tileUrls.length) return []

  const fallbackBounds = resolveSiSentinelAoiWmsBoundsLngLat(options.clipSource)
  return stack.tileUrls.map((url, index) => ({
    url,
    boundsLngLat: stack.displayChunks[index]?.aoiBoundsLngLat ?? fallbackBounds,
  }))
}

export function buildDevelopEliteLayerLiveTileUrls(options: {
  layerId: string
  isoDate: string
  clipSource: unknown
  catalog?: SentinelHubWmsLayerInfo[]
  cloudCoverage?: number
}): string[] {
  return buildDevelopEliteLayerLiveTilePlans(options).map(plan => plan.url)
}

export function buildDevelopEliteLayerLiveTileUrl(options: {
  layerId: string
  isoDate: string
  clipSource: unknown
  catalog?: SentinelHubWmsLayerInfo[]
  cloudCoverage?: number
}): string | null {
  return buildDevelopEliteLayerLiveTileUrls(options)[0] ?? null
}
