import {
  GIS_CONTENT_REPOSITORY_EVENT,
  type GisContentRepositoryChangeDetail,
} from '../../../lib/gisContentRepository'
import { geojsonCollectionSignature } from './acpStructuresLoadPolicy'

/** Dispatched on window when AOI / linked layers should resync (weather, alerts, WMS). */
export const ACP_AOI_SYNC_EVENT = 'acp-aoi-sync'

export type AcpAoiSyncReason = 'engine' | 'map' | 'portal' | 'alerts' | 'manual' | 'gis-repository'

export type AcpAoiSyncDetail = {
  reason: AcpAoiSyncReason
  signature: string
  outlineSignature?: string
  at: number
}

type AcpAoiSyncListener = (detail: AcpAoiSyncDetail) => void

const listeners = new Set<AcpAoiSyncListener>()
let lastEmitKey = ''

export function buildAcpAoiSyncSignature(
  mask: GeoJSON.FeatureCollection | null | undefined,
  outline?: GeoJSON.FeatureCollection | null,
): string {
  return `${geojsonCollectionSignature(mask)}|${geojsonCollectionSignature(outline ?? null)}`
}

export function emitAcpAoiSync(
  detail: Omit<AcpAoiSyncDetail, 'at'> & { force?: boolean },
): void {
  const key = `${detail.reason}|${detail.signature}|${detail.outlineSignature ?? ''}`
  if (!detail.force && key === lastEmitKey) return
  lastEmitKey = key
  const payload: AcpAoiSyncDetail = { ...detail, at: Date.now() }
  listeners.forEach(fn => fn(payload))
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ACP_AOI_SYNC_EVENT, { detail: payload }))
  }
}

export function subscribeAcpAoiSync(listener: AcpAoiSyncListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Portal / map-registry changes that can alter Agro_Structures AOI geometry. */
export function installAcpGisRepositoryAoiListener(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {}

  const handler = (event: Event) => {
    const detail = (event as CustomEvent<GisContentRepositoryChangeDetail | undefined>).detail
    if (!detail) {
      onChange()
      return
    }
    if (
      detail.scope === 'map-registry' ||
      detail.scope === 'item' ||
      detail.scope === 'bulk' ||
      detail.scope === 'refresh'
    ) {
      onChange()
    }
  }

  window.addEventListener(GIS_CONTENT_REPOSITORY_EVENT, handler)
  return () => window.removeEventListener(GIS_CONTENT_REPOSITORY_EVENT, handler)
}
