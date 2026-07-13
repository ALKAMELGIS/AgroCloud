/**
 * Imperative Mapbox GL lifecycle for Layers AOI Sentinel WMS stacks.
 * Ping-pong raster sources keep the previous frame visible until the next
 * tile set is fully loaded — zero blank frames on date/layer swaps.
 */

import type { Map as MapboxMap } from 'mapbox-gl'
import { SENTINEL_HUB_WMS_TILE_PIXELS } from './sentinelHubWmsLayers'
import {
  resolveSiSentinelAoiWmsChunkBounds,
  type SiSentinelAoiWmsStackState,
  siSentinelAoiWmsLayerId,
  siSentinelAoiWmsSourceId,
} from './siSentinelAoiWmsStack'
import {
  setSiSentinelAoiWmsLayerPresentation,
  siSentinelAoiWmsChunkKey,
  syncSiSentinelAoiWmsChunkBounds,
  syncSiSentinelAoiWmsChunkTiles,
  type SiSentinelRasterSourceMutable,
} from './siSentinelAoiWmsFlickerFree'

export type SiSentinelAoiWmsPingPongSlot = 0 | 1

export function siSentinelAoiWmsPingPongSourceId(
  idPrefix: string,
  chunkIdx: number,
  slot: SiSentinelAoiWmsPingPongSlot,
): string {
  return `${siSentinelAoiWmsSourceId(idPrefix, chunkIdx)}-s${slot}`
}

export function siSentinelAoiWmsPingPongLayerId(
  idPrefix: string,
  chunkIdx: number,
  slot: SiSentinelAoiWmsPingPongSlot,
): string {
  return `${siSentinelAoiWmsLayerId(idPrefix, chunkIdx)}-s${slot}`
}

export function isSiSentinelAoiWmsPingPongMapId(id: string): boolean {
  return /-s[01]$/.test(id)
}

type PingPongChunkState = {
  activeSlot: SiSentinelAoiWmsPingPongSlot
  activeUrl: string
  waitCleanup: (() => void) | null
}

export type SiSentinelAoiWmsPingPongRuntime = {
  chunks: Map<string, PingPongChunkState>
  appliedUrls: Map<string, string>
  appliedBounds: Map<string, string>
  mountedChunkCount: number
}

export function createSiSentinelAoiWmsPingPongRuntime(): SiSentinelAoiWmsPingPongRuntime {
  return {
    chunks: new Map(),
    appliedUrls: new Map(),
    appliedBounds: new Map(),
    mountedChunkCount: 0,
  }
}

export function resetSiSentinelAoiWmsPingPongRuntime(runtime: SiSentinelAoiWmsPingPongRuntime): void {
  runtime.chunks.clear()
  runtime.appliedUrls.clear()
  runtime.appliedBounds.clear()
  runtime.mountedChunkCount = 0
}

export function siSentinelAoiWmsPingPongStackUrlsReady(
  map: MapboxMap,
  stack: SiSentinelAoiWmsStackState,
  runtime: SiSentinelAoiWmsPingPongRuntime,
): boolean {
  if (!stack.displayChunks.length) return false
  for (let i = 0; i < stack.displayChunks.length; i++) {
    const url = String(stack.tileUrls[i] ?? '').trim()
    if (!url) return false
    const chunkKey = siSentinelAoiWmsChunkKey(stack.idPrefix, i)
    const state = runtime.chunks.get(chunkKey)
    const activeSlot = state?.activeSlot ?? 0
    const sourceId = siSentinelAoiWmsPingPongSourceId(stack.idPrefix, i, activeSlot)
    if (state?.activeUrl !== url) return false
    if (!map.getSource(sourceId)) return false
  }
  return true
}

function slotUrlKey(chunkKey: string, slot: SiSentinelAoiWmsPingPongSlot): string {
  return `${chunkKey}:s${slot}`
}

function otherSlot(slot: SiSentinelAoiWmsPingPongSlot): SiSentinelAoiWmsPingPongSlot {
  return slot === 0 ? 1 : 0
}

function readRasterSource(map: MapboxMap, sourceId: string): SiSentinelRasterSourceMutable | null {
  return map.getSource(sourceId) as SiSentinelRasterSourceMutable | null
}

function ensurePingPongRasterPair(
  map: MapboxMap,
  stack: SiSentinelAoiWmsStackState,
  chunkIdx: number,
  minZoom: number,
): void {
  const chunk = stack.displayChunks[chunkIdx]
  const bounds = resolveSiSentinelAoiWmsChunkBounds(stack, chunk)
  const placeholderUrl = stack.tileUrls[chunkIdx] ?? 'about:blank'

  for (const slot of [0, 1] as const) {
    const sourceId = siSentinelAoiWmsPingPongSourceId(stack.idPrefix, chunkIdx, slot)
    const layerId = siSentinelAoiWmsPingPongLayerId(stack.idPrefix, chunkIdx, slot)

    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {
        type: 'raster',
        tiles: [placeholderUrl],
        tileSize: SENTINEL_HUB_WMS_TILE_PIXELS,
        minzoom: minZoom,
        ...(bounds ? { bounds } : {}),
      })
    }

    if (!map.getLayer(layerId)) {
      map.addLayer({
        id: layerId,
        type: 'raster',
        source: sourceId,
        layout: { visibility: 'none' },
        paint: {
          'raster-opacity': 0,
          'raster-fade-duration': 0,
          'raster-resampling': 'linear',
        },
      })
    }
  }
}

function removePingPongRasterPair(map: MapboxMap, idPrefix: string, chunkIdx: number): void {
  for (const slot of [0, 1] as const) {
    const layerId = siSentinelAoiWmsPingPongLayerId(idPrefix, chunkIdx, slot)
    const sourceId = siSentinelAoiWmsPingPongSourceId(idPrefix, chunkIdx, slot)
    try {
      if (map.getLayer(layerId)) map.removeLayer(layerId)
      if (map.getSource(sourceId)) map.removeSource(sourceId)
    } catch {
      /* style rebuild race */
    }
  }
}

/** Mount ping-pong source/layer pairs once per chunk — never via React <Source>. */
export function ensureSiSentinelAoiWmsPingPongStackOnMap(
  map: MapboxMap,
  stack: SiSentinelAoiWmsStackState,
  minZoom: number,
  runtime: SiSentinelAoiWmsPingPongRuntime,
): void {
  const chunkCount = stack.displayChunks.length
  for (let i = 0; i < chunkCount; i++) {
    ensurePingPongRasterPair(map, stack, i, minZoom)
  }
  for (let i = chunkCount; i < runtime.mountedChunkCount; i++) {
    removePingPongRasterPair(map, stack.idPrefix, i)
    runtime.chunks.delete(siSentinelAoiWmsChunkKey(stack.idPrefix, i))
  }
  runtime.mountedChunkCount = chunkCount
}

function applyChunkPresentation(
  map: MapboxMap,
  stack: SiSentinelAoiWmsStackState,
  chunkIdx: number,
  slot: SiSentinelAoiWmsPingPongSlot,
  visible: boolean,
  opacity: number,
): void {
  const chunk = stack.displayChunks[chunkIdx]
  const layerId = siSentinelAoiWmsPingPongLayerId(stack.idPrefix, chunkIdx, slot)
  setSiSentinelAoiWmsLayerPresentation(
    map,
    layerId,
    visible,
    opacity,
    Boolean(chunk?.evalscriptB64),
  )
}

function commitActiveSlot(
  map: MapboxMap,
  stack: SiSentinelAoiWmsStackState,
  chunkIdx: number,
  runtime: SiSentinelAoiWmsPingPongRuntime,
  nextActive: SiSentinelAoiWmsPingPongSlot,
  url: string,
  presentation: { visible: boolean; opacity: number },
): void {
  const chunkKey = siSentinelAoiWmsChunkKey(stack.idPrefix, chunkIdx)
  const prev = runtime.chunks.get(chunkKey)
  const prevActive = prev?.activeSlot ?? 0

  if (prevActive !== nextActive) {
    applyChunkPresentation(map, stack, chunkIdx, prevActive, false, presentation.opacity)
  }
  applyChunkPresentation(map, stack, chunkIdx, nextActive, presentation.visible, presentation.opacity)
  runtime.chunks.set(chunkKey, { activeSlot: nextActive, activeUrl: url, waitCleanup: null })
}

function waitForSourceReady(
  map: MapboxMap,
  sourceId: string,
  onReady: () => void,
): () => void {
  if (map.isSourceLoaded(sourceId)) {
    onReady()
    return () => undefined
  }

  const handler = (ev: { sourceId?: string; isSourceLoaded?: boolean }) => {
    if (ev.sourceId !== sourceId) return
    if (!map.isSourceLoaded(sourceId)) return
    cleanup()
    onReady()
  }

  const onIdle = () => {
    if (!map.isSourceLoaded(sourceId)) return
    cleanup()
    onReady()
  }

  const cleanup = () => {
    try {
      map.off('sourcedata', handler)
      map.off('idle', onIdle)
    } catch {
      /* ignore */
    }
  }

  try {
    map.on('sourcedata', handler)
    map.on('idle', onIdle)
  } catch {
    cleanup()
    onReady()
    return () => undefined
  }

  return cleanup
}

function syncChunkTilesPingPong(
  map: MapboxMap,
  stack: SiSentinelAoiWmsStackState,
  chunkIdx: number,
  runtime: SiSentinelAoiWmsPingPongRuntime,
  presentation: { visible: boolean; opacity: number },
): void {
  const url = String(stack.tileUrls[chunkIdx] ?? '').trim()
  if (!url) return

  const chunkKey = siSentinelAoiWmsChunkKey(stack.idPrefix, chunkIdx)
  const chunk = stack.displayChunks[chunkIdx]
  const state = runtime.chunks.get(chunkKey)
  const activeSlot = state?.activeSlot ?? 0
  const activeUrl = state?.activeUrl ?? ''

  if (activeUrl === url) {
    const bounds = resolveSiSentinelAoiWmsChunkBounds(stack, chunk) ?? null
    for (const slot of [0, 1] as const) {
      const sourceId = siSentinelAoiWmsPingPongSourceId(stack.idPrefix, chunkIdx, slot)
      syncSiSentinelAoiWmsChunkBounds(
        readRasterSource(map, sourceId),
        bounds,
        runtime.appliedBounds,
        slotUrlKey(chunkKey, slot),
      )
    }
    applyChunkPresentation(map, stack, chunkIdx, activeSlot, presentation.visible, presentation.opacity)
    applyChunkPresentation(map, stack, chunkIdx, otherSlot(activeSlot), false, presentation.opacity)
    return
  }

  const bounds = resolveSiSentinelAoiWmsChunkBounds(stack, chunk) ?? null
  for (const slot of [0, 1] as const) {
    const sourceId = siSentinelAoiWmsPingPongSourceId(stack.idPrefix, chunkIdx, slot)
    syncSiSentinelAoiWmsChunkBounds(
      readRasterSource(map, sourceId),
      bounds,
      runtime.appliedBounds,
      slotUrlKey(chunkKey, slot),
    )
  }

  state?.waitCleanup?.()

  if (!activeUrl) {
    const sourceId = siSentinelAoiWmsPingPongSourceId(stack.idPrefix, chunkIdx, activeSlot)
    const src = readRasterSource(map, sourceId)
    syncSiSentinelAoiWmsChunkTiles(src, url, runtime.appliedUrls, slotUrlKey(chunkKey, activeSlot))
    const reveal = () => commitActiveSlot(map, stack, chunkIdx, runtime, activeSlot, url, presentation)
    const cleanup = waitForSourceReady(map, sourceId, reveal)
    runtime.chunks.set(chunkKey, {
      activeSlot,
      activeUrl: url,
      waitCleanup: cleanup,
    })
    return
  }

  const inactiveSlot = otherSlot(activeSlot)
  const inactiveUrlKey = slotUrlKey(chunkKey, inactiveSlot)
  const inactiveSourceId = siSentinelAoiWmsPingPongSourceId(stack.idPrefix, chunkIdx, inactiveSlot)

  if (runtime.appliedUrls.get(inactiveUrlKey) === url && map.isSourceLoaded(inactiveSourceId)) {
    commitActiveSlot(map, stack, chunkIdx, runtime, inactiveSlot, url, presentation)
    return
  }

  const inactiveSrc = readRasterSource(map, inactiveSourceId)
  syncSiSentinelAoiWmsChunkTiles(inactiveSrc, url, runtime.appliedUrls, inactiveUrlKey)

  applyChunkPresentation(map, stack, chunkIdx, activeSlot, presentation.visible, presentation.opacity)

  const cleanup = waitForSourceReady(map, inactiveSourceId, () => {
    commitActiveSlot(map, stack, chunkIdx, runtime, inactiveSlot, url, presentation)
  })
  runtime.chunks.set(chunkKey, {
    activeSlot,
    activeUrl,
    waitCleanup: cleanup,
  })
}

/**
 * Visibility-only show when tiles are already loaded and URLs match.
 * Falls back to full ping-pong sync when a cold load is required.
 */
export function revealSiSentinelAoiWmsPingPongStack(
  map: MapboxMap,
  stack: SiSentinelAoiWmsStackState,
  runtime: SiSentinelAoiWmsPingPongRuntime,
  presentation: { visible: boolean; opacity: number },
): void {
  if (!stack.displayChunks.length) return
  if (siSentinelAoiWmsPingPongStackUrlsReady(map, stack, runtime)) {
    for (let i = 0; i < stack.displayChunks.length; i++) {
      const chunkKey = siSentinelAoiWmsChunkKey(stack.idPrefix, i)
      const state = runtime.chunks.get(chunkKey)
      const activeSlot = state?.activeSlot ?? 0
      applyChunkPresentation(map, stack, i, activeSlot, presentation.visible, presentation.opacity)
      applyChunkPresentation(map, stack, i, otherSlot(activeSlot), false, presentation.opacity)
    }
    return
  }
  syncSiSentinelAoiWmsPingPongStack(map, stack, runtime, presentation)
}

/** Sync tile URLs with ping-pong buffering and apply visibility — Layers AOI only. */
export function syncSiSentinelAoiWmsPingPongStack(
  map: MapboxMap,
  stack: SiSentinelAoiWmsStackState,
  runtime: SiSentinelAoiWmsPingPongRuntime,
  presentation: { visible: boolean; opacity: number },
): void {
  if (!stack.displayChunks.length) return
  for (let i = 0; i < stack.displayChunks.length; i++) {
    syncChunkTilesPingPong(map, stack, i, runtime, presentation)
  }
}

/** Hide all ping-pong layers without removing sources (instant re-show). */
export function hideSiSentinelAoiWmsPingPongStack(
  map: MapboxMap,
  stack: SiSentinelAoiWmsStackState,
  runtime: SiSentinelAoiWmsPingPongRuntime,
  opacity: number,
): void {
  for (let i = 0; i < runtime.mountedChunkCount; i++) {
    for (const slot of [0, 1] as const) {
      const chunk = stack.displayChunks[i]
      const layerId = siSentinelAoiWmsPingPongLayerId(stack.idPrefix, i, slot)
      setSiSentinelAoiWmsLayerPresentation(
        map,
        layerId,
        false,
        opacity,
        Boolean(chunk?.evalscriptB64),
      )
    }
  }
}

export function teardownSiSentinelAoiWmsPingPongStack(
  map: MapboxMap,
  idPrefix: string,
  runtime: SiSentinelAoiWmsPingPongRuntime,
): void {
  for (let i = 0; i < runtime.mountedChunkCount; i++) {
    runtime.chunks.get(siSentinelAoiWmsChunkKey(idPrefix, i))?.waitCleanup?.()
    removePingPongRasterPair(map, idPrefix, i)
  }
  runtime.chunks.clear()
  runtime.appliedUrls.clear()
  runtime.appliedBounds.clear()
  runtime.mountedChunkCount = 0
}

/** Reload tiles on the active ping-pong slot (transient WMS error recovery). */
export function reloadSiSentinelAoiWmsPingPongStackTiles(
  map: MapboxMap,
  stack: SiSentinelAoiWmsStackState,
  runtime: SiSentinelAoiWmsPingPongRuntime,
  options?: { force?: boolean },
): void {
  for (let i = 0; i < stack.displayChunks.length; i++) {
    const chunkKey = siSentinelAoiWmsChunkKey(stack.idPrefix, i)
    const state = runtime.chunks.get(chunkKey)
    const slot = state?.activeSlot ?? 0
    const url = String(stack.tileUrls[i] ?? '').trim()
    if (!url) continue
    const urlKey = slotUrlKey(chunkKey, slot)
    if (options?.force) {
      runtime.appliedUrls.delete(urlKey)
    }
    const src = readRasterSource(map, siSentinelAoiWmsPingPongSourceId(stack.idPrefix, i, slot))
    syncSiSentinelAoiWmsChunkTiles(src, url, runtime.appliedUrls, urlKey)
  }
}
