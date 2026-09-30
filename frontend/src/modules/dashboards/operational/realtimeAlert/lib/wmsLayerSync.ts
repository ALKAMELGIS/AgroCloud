/**
 * WMS tile invalidation when GIS Content layer revision changes.
 */

export type WmsLayerSyncResult = {
  layerId: string
  revision: number
  syncedAt: string
}

export async function syncRealtimeAlertWmsLayer(layerId: string): Promise<WmsLayerSyncResult> {
  const res = await fetch(`/api/v1/realtime-alert/layers/${encodeURIComponent(layerId)}/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error(`WMS sync failed (${res.status})`)
  const body = (await res.json()) as WmsLayerSyncResult & { ok?: boolean }
  return {
    layerId: body.layerId ?? layerId,
    revision: body.revision ?? Date.now(),
    syncedAt: body.syncedAt ?? new Date().toISOString(),
  }
}

export function bumpWmsCacheKey(prev: number): number {
  return prev + 1
}
