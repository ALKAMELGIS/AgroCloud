/**
 * Per-satellite Remote Sensing session (layer, collection, imagery date).
 * Switching providers restores the last settings for that satellite.
 */

import {
  defaultCollectionForProvider,
  remoteSensingCollectionsForProvider,
} from './remoteSensingProviders'
import { resolveRemoteSensingLayerProfile } from './remoteSensingLayerProfiles'
import { SI_DEFAULT_LIVE_WMS_LAYER } from './sentinelHubWmsLayers'

export type RemoteSensingProviderSession = {
  collection: string
  layerId: string
  imageryIso: string
  imageryDateAutoFollow: boolean
  timeSeriesStart: string
  timeSeriesEnd: string
}

/** Providers with static Layer catalogs (no Sentinel Hub GetCapabilities needed). */
export function providerUsesStaticLayerCatalog(
  providerId: string,
  collectionId?: string,
): boolean {
  return resolveRemoteSensingLayerProfile(providerId, collectionId) === 'aster-optical'
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
  const layerId = providerUsesStaticLayerCatalog(providerId, collection)
    ? 'VNIR'
    : SI_DEFAULT_LIVE_WMS_LAYER
  return {
    collection,
    layerId,
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
