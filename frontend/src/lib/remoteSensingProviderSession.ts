/**
 * Per-satellite Remote Sensing session (layer, collection, imagery date).
 * Switching providers restores the last settings for that satellite.
 */

import {
  defaultCollectionForProvider,
  remoteSensingCollectionsForProvider,
} from './remoteSensingProviders'
import { resolveRemoteSensingLayerProfile } from './remoteSensingLayerProfiles'
import { getCollectionIndexDefs } from './collectionIndexCatalog'
import { SI_DEFAULT_LIVE_WMS_LAYER } from './sentinelHubWmsLayers'

export type RemoteSensingProviderSession = {
  collection: string
  layerId: string
  imageryIso: string
  imageryDateAutoFollow: boolean
  timeSeriesStart: string
  timeSeriesEnd: string
}

/** Providers / collections with static Layer catalogs (no Sentinel Hub GetCapabilities needed). */
export function providerUsesStaticLayerCatalog(
  providerId: string,
  collectionId?: string,
): boolean {
  const profile = resolveRemoteSensingLayerProfile(providerId, collectionId)
  return profile === 'aster-optical' || profile === 'collection-catalog'
}

function defaultLayerIdForProviderCollection(providerId: string, collection: string): string {
  const profile = resolveRemoteSensingLayerProfile(providerId, collection)
  if (profile === 'aster-optical') return 'VNIR'
  if (profile === 'collection-catalog') {
    return getCollectionIndexDefs(collection)[0]?.id || SI_DEFAULT_LIVE_WMS_LAYER
  }
  return SI_DEFAULT_LIVE_WMS_LAYER
}

export function createDefaultRemoteSensingProviderSession(
  providerId: string,
  defaults: {
    imageryIso: string
    timeSeriesStart: string
    timeSeriesEnd: string
  },
): RemoteSensingProviderSession {
  const collection = defaultCollectionForProvider(providerId)
  return {
    collection,
    layerId: defaultLayerIdForProviderCollection(providerId, collection),
    imageryIso: defaults.imageryIso,
    imageryDateAutoFollow: true,
    timeSeriesStart: defaults.timeSeriesStart,
    timeSeriesEnd: defaults.timeSeriesEnd,
  }
}

export function resolveRemoteSensingProviderSession(
  store: Map<string, RemoteSensingProviderSession>,
  providerId: string,
  defaults: {
    imageryIso: string
    timeSeriesStart: string
    timeSeriesEnd: string
  },
): RemoteSensingProviderSession {
  const saved = store.get(providerId)
  if (!saved) return createDefaultRemoteSensingProviderSession(providerId, defaults)

  const cols = remoteSensingCollectionsForProvider(providerId)
  const collection = cols.some(c => c.id === saved.collection)
    ? saved.collection
    : defaultCollectionForProvider(providerId)

  return {
    ...saved,
    collection,
    layerId: saved.layerId || createDefaultRemoteSensingProviderSession(providerId, defaults).layerId,
  }
}

export function snapshotRemoteSensingProviderSession(input: {
  collection: string
  layerId: string
  imageryIso: string
  imageryDateAutoFollow: boolean
  timeSeriesStart: string
  timeSeriesEnd: string
}): RemoteSensingProviderSession {
  return {
    collection: input.collection,
    layerId: input.layerId,
    imageryIso: input.imageryIso,
    imageryDateAutoFollow: input.imageryDateAutoFollow,
    timeSeriesStart: input.timeSeriesStart,
    timeSeriesEnd: input.timeSeriesEnd,
  }
}
