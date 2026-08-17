/**
 * Analysis AOI geometry cache — full-layer query independent of Mapbox viewport streaming.
 *
 * Map display may load visible features only. Sentinel clip / stats / export always
 * read from this cache so analysis never depends on pan/zoom.
 */

import { fetchArcGisFeatureLayerGeoJson } from './arcgisFeatureLayerGeoJson'
import {
  layersAoiExpectedFeatureCount,
  type LayersAoiClipGeoJson,
} from './layersAoiClipGeoJson'
import type { SiAoiMaskBuilderLayerLike } from './siAoiMaskBuilder'

export type SiAoiGeometryStatus = 'idle' | 'loading' | 'complete' | 'error'

export type SiAoiGeometryRecord = {
  layerId: string
  status: SiAoiGeometryStatus
  expectedCount: number | null
  loadedCount: number
  geojson: LayersAoiClipGeoJson | null
  error: string | null
  queriedUrl: string | null
}

export type SiAoiGeometryLayerLike = SiAoiMaskBuilderLayerLike & {
  authToken?: string
  sourceUrl?: string
  viewportStreaming?: boolean
  source?: string
}

const records = new Map<string, SiAoiGeometryRecord>()
const inflight = new Map<string, Promise<SiAoiGeometryRecord>>()
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

function emptyRecord(layerId: string): SiAoiGeometryRecord {
  return {
    layerId,
    status: 'idle',
    expectedCount: null,
    loadedCount: 0,
    geojson: null,
    error: null,
    queriedUrl: null,
  }
}

function featureList(layer: SiAoiMaskBuilderLayerLike | null | undefined): unknown[] {
  return Array.isArray(layer?.geojson?.features) ? layer!.geojson!.features! : []
}

export function subscribeSiAoiGeometryCache(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getSiAoiGeometryRecord(layerId: string | null | undefined): SiAoiGeometryRecord | null {
  if (!layerId) return null
  return records.get(String(layerId)) ?? null
}

export function peekSiAoiAnalysisGeoJson(layerId: string | null | undefined): LayersAoiClipGeoJson | null {
  const rec = getSiAoiGeometryRecord(layerId)
  return rec?.geojson?.features?.length ? rec.geojson : null
}

export function isSiAoiGeometryComplete(rec: SiAoiGeometryRecord | null | undefined): boolean {
  return Boolean(rec && rec.status === 'complete' && rec.loadedCount > 0)
}

/**
 * True when Sentinel analysis must query the service instead of using Mapbox /
 * viewport GeoJSON (streaming ArcGIS layers, or local slice thinner than metadata).
 */
export function layerNeedsFullAoiServiceQuery(layer: SiAoiGeometryLayerLike | null | undefined): boolean {
  if (!layer) return false
  const url = String(layer.sourceUrl || '').trim()
  const streaming = Boolean(layer.viewportStreaming)
  const source = String(layer.source || '')
  if (streaming && url) return true
  if (source === 'arcgis' && url) {
    const localN = featureList(layer).length
    const expected = layersAoiExpectedFeatureCount(layer)
    if (localN === 0) return true
    if (expected != null && localN < expected) return true
  }
  return false
}

function seedFromLocalGeoJson(layer: SiAoiGeometryLayerLike): SiAoiGeometryRecord {
  const layerId = String(layer.id || '')
  const features = [...featureList(layer)]
  const expected = layersAoiExpectedFeatureCount(layer)
  const rec: SiAoiGeometryRecord = {
    layerId,
    status: features.length ? 'complete' : 'error',
    expectedCount: expected != null ? Math.max(expected, features.length) : features.length || null,
    loadedCount: features.length,
    geojson: features.length ? { type: 'FeatureCollection', features } : null,
    error: features.length ? null : 'Layer has no polygon features',
    queriedUrl: null,
  }
  records.set(layerId, rec)
  emit()
  return rec
}

function isUserAbort(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true
  if (err && typeof err === 'object' && 'name' in err && (err as { name?: string }).name === 'AbortError') {
    return true
  }
  return false
}

/**
 * Ensure analysis geometry for a layer. Never writes into Mapbox / layer.geojson.
 * Reuses a completed service query for the same URL.
 */
export async function ensureSiAoiGeometryCache(
  layer: SiAoiGeometryLayerLike | null | undefined,
  options?: {
    token?: string
    signal?: AbortSignal
    resolveUrl?: (url: string) => string
  },
): Promise<SiAoiGeometryRecord> {
  if (!layer?.id) return emptyRecord('')
  const layerId = String(layer.id)
  const rawUrl = String(layer.sourceUrl || '').trim()
  const existing = records.get(layerId)

  if (isSiAoiGeometryComplete(existing) && existing!.queriedUrl) {
    if (!rawUrl || existing!.queriedUrl === (options?.resolveUrl ? options.resolveUrl(rawUrl) : rawUrl)) {
      return existing!
    }
  }

  if (!layerNeedsFullAoiServiceQuery(layer)) {
    if (isSiAoiGeometryComplete(existing) && !existing!.queriedUrl) return existing!
    return seedFromLocalGeoJson(layer)
  }

  if (!rawUrl) {
    return seedFromLocalGeoJson(layer)
  }

  const pending = inflight.get(layerId)
  if (pending) return pending

  const url = options?.resolveUrl ? options.resolveUrl(rawUrl) : rawUrl
  if (isSiAoiGeometryComplete(existing) && existing!.queriedUrl === url) {
    return existing!
  }

  const promise = (async () => {
    const loading: SiAoiGeometryRecord = {
      layerId,
      status: 'loading',
      expectedCount: layersAoiExpectedFeatureCount(layer) ?? existing?.expectedCount ?? null,
      loadedCount: existing?.loadedCount ?? 0,
      geojson: existing?.geojson ?? null,
      error: null,
      queriedUrl: url,
    }
    records.set(layerId, loading)
    emit()
    try {
      const fc = await fetchArcGisFeatureLayerGeoJson(url, {
        token: options?.token,
        timeoutMs: 120_000,
        signal: options?.signal,
        onProgress: progress => {
          if (options?.signal?.aborted) return
          const cur = records.get(layerId)
          if (!cur || cur.status === 'complete') return
          records.set(layerId, {
            ...cur,
            status: 'loading',
            loadedCount: progress.featureCount,
            expectedCount:
              cur.expectedCount != null
                ? Math.max(cur.expectedCount, progress.featureCount)
                : progress.featureCount || cur.expectedCount,
          })
          emit()
        },
      })
      if (options?.signal?.aborted) {
        return records.get(layerId) ?? emptyRecord(layerId)
      }
      const features = Array.isArray(fc.features) ? fc.features : []
      const done: SiAoiGeometryRecord = {
        layerId,
        status: features.length ? 'complete' : 'error',
        expectedCount: Math.max(layersAoiExpectedFeatureCount(layer) ?? 0, features.length) || features.length,
        loadedCount: features.length,
        geojson: features.length ? { type: 'FeatureCollection', features } : null,
        error: features.length ? null : 'Layer query returned no polygons',
        queriedUrl: url,
      }
      records.set(layerId, done)
      emit()
      return done
    } catch (err) {
      if (isUserAbort(err, options?.signal)) {
        const cur = records.get(layerId)
        if (cur?.status === 'loading' && !cur.geojson?.features?.length) {
          records.set(layerId, { ...cur, status: 'idle' })
          emit()
        }
        return records.get(layerId) ?? emptyRecord(layerId)
      }
      const message = err instanceof Error ? err.message : 'AOI query failed'
      const failed: SiAoiGeometryRecord = {
        layerId,
        status: 'error',
        expectedCount: layersAoiExpectedFeatureCount(layer) ?? existing?.expectedCount ?? null,
        loadedCount: existing?.loadedCount ?? 0,
        geojson: existing?.geojson ?? null,
        error: message,
        queriedUrl: url,
      }
      records.set(layerId, failed)
      emit()
      return failed
    } finally {
      inflight.delete(layerId)
    }
  })()

  inflight.set(layerId, promise)
  return promise
}

export function clearSiAoiGeometryCache(layerId?: string): void {
  if (layerId) {
    records.delete(String(layerId))
    inflight.delete(String(layerId))
  } else {
    records.clear()
    inflight.clear()
  }
  emit()
}
