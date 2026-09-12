/**
 * Imperative Mapbox GL lifecycle for Layers AOI Sentinel WMS stacks.
 * Ping-pong raster sources prefetch at opacity 0, then reveal only when tiles
 * are fully loaded — no partial tile seams on Show on map.
 */

import type { Map as MapboxMap } from 'mapbox-gl'
import {
  SENTINEL_HUB_WMS_TILE_PIXELS,
  SI_SENTINEL_WMS_MAP_DISPLAY_MIN_ZOOM,
} from './sentinelHubWmsLayers'
import { resolveSiAnalysisRasterBeforeLayerId } from './siMapAnalysisLayerOrder'
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
  /** URL loading on the inactive slot before swap commit. */
  pendingUrl: string
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
  for (const state of runtime.chunks.values()) {
    state.waitCleanup?.()
  }
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
    if (state?.pendingUrl) return false
    if (!map.getSource(sourceId)) return false
  }
  return true
}

/** True when every active chunk's tiles finished loading (warm prefetch complete). */
export function siSentinelAoiWmsPingPongStackTilesLoaded(
  map: MapboxMap,
  stack: SiSentinelAoiWmsStackState,
  runtime: SiSentinelAoiWmsPingPongRuntime,
): boolean {
  if (!siSentinelAoiWmsPingPongStackUrlsReady(map, stack, runtime)) return false
  for (let i = 0; i < stack.displayChunks.length; i++) {
    const chunkKey = siSentinelAoiWmsChunkKey(stack.idPrefix, i)
    const state = runtime.chunks.get(chunkKey)
    const activeSlot = state?.activeSlot ?? 0
    const sourceId = siSentinelAoiWmsPingPongSourceId(stack.idPrefix, i, activeSlot)
    if (!map.isSourceLoaded(sourceId)) return false
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

function syncPingPongSourceDisplayMinZoom(map: MapboxMap, sourceId: string): void {
  try {
    const setSourceProperty = (map as MapboxMap & {
      setSourceProperty?: (id: string, property: string, value: number) => void
    }).setSourceProperty
    setSourceProperty?.(sourceId, 'minzoom', SI_SENTINEL_WMS_MAP_DISPLAY_MIN_ZOOM)
  } catch {
    /* style rebuild race */
  }
}

function ensurePingPongRasterPair(
  map: MapboxMap,
  stack: SiSentinelAoiWmsStackState,
  chunkIdx: number,
  beforeLayerId?: string,
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
        tileSize: stack.tilePixels || SENTINEL_HUB_WMS_TILE_PIXELS,
        minzoom: SI_SENTINEL_WMS_MAP_DISPLAY_MIN_ZOOM,
        ...(bounds ? { bounds } : {}),
      })
    } else {
      syncPingPongSourceDisplayMinZoom(map, sourceId)
    }

    if (!map.getLayer(layerId)) {
      const preferredBefore =
        beforeLayerId && map.getLayer(beforeLayerId) ? beforeLayerId : undefined
      const beforeId = preferredBefore ?? resolveSiAnalysisRasterBeforeLayerId(map)
      try {
        map.addLayer(
          {
            id: layerId,
            type: 'raster',
            source: sourceId,
            // Stay layout-visible at opacity 0 so warm prefetch can load tiles
            // (visibility:none prevents Mapbox from requesting WMS tiles).
            layout: { visibility: 'visible' },
            paint: {
              'raster-opacity': 0,
              'raster-fade-duration': 0,
              'raster-resampling': 'linear',
            },
          },
          beforeId && map.getLayer(beforeId) ? beforeId : undefined,
        )
      } catch {
        try {
          map.addLayer({
            id: layerId,
            type: 'raster',
            source: sourceId,
            layout: { visibility: 'visible' },
            paint: {
              'raster-opacity': 0,
              'raster-fade-duration': 0,
              'raster-resampling': 'linear',
            },
          })
        } catch {
          /* style rebuild race */
        }
      }
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
  runtime: SiSentinelAoiWmsPingPongRuntime,
  options?: { beforeLayerId?: string },
): void {
  const beforeLayerId = options?.beforeLayerId ?? resolveSiAnalysisRasterBeforeLayerId(map)
  const chunkCount = stack.displayChunks.length
  for (let i = 0; i < chunkCount; i++) {
    ensurePingPongRasterPair(map, stack, i, beforeLayerId)
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
  runtime.chunks.set(chunkKey, {
    activeSlot: nextActive,
    activeUrl: url,
    pendingUrl: '',
    waitCleanup: null,
  })
}

/** Safety net if `sourcedata` is missed after the inactive source actually loaded. */
const SI_SENTINEL_AOI_WMS_SOURCE_READY_SAFETY_MS = 1_200

function waitForSourceReady(
  map: MapboxMap,
  sourceId: string,
  onReady: () => void,
  options?: { skipImmediate?: boolean },
): () => void {
  if (!options?.skipImmediate && map.isSourceLoaded(sourceId)) {
    onReady()
    return () => undefined
  }

  let settled = false
  const finishIfLoaded = () => {
    if (settled) return
    if (!map.isSourceLoaded(sourceId)) return
    settled = true
    cleanup()
    onReady()
  }

  const handler = (ev: {
    sourceId?: string
    isSourceLoaded?: boolean
    sourceDataType?: string
  }) => {
    if (ev.sourceId !== sourceId) return
    if (ev.sourceDataType === 'metadata') return
    finishIfLoaded()
  }

  const timeoutId =
    typeof window !== 'undefined'
      ? window.setTimeout(finishIfLoaded, SI_SENTINEL_AOI_WMS_SOURCE_READY_SAFETY_MS)
      : (0 as unknown as ReturnType<typeof setTimeout>)

  const cleanup = () => {
    try {
      map.off('sourcedata', handler)
    } catch {
      /* ignore */
    }
    if (typeof window !== 'undefined') window.clearTimeout(timeoutId)
  }

  try {
    map.on('sourcedata', handler)
  } catch {
    cleanup()
    if (map.isSourceLoaded(sourceId)) onReady()
    return () => undefined
  }

  return cleanup
}

function syncChunkBoundsBothSlots(
  map: MapboxMap,
  stack: SiSentinelAoiWmsStackState,
  chunkIdx: number,
  runtime: SiSentinelAoiWmsPingPongRuntime,
): void {
  const chunk = stack.displayChunks[chunkIdx]
  const chunkKey = siSentinelAoiWmsChunkKey(stack.idPrefix, chunkIdx)
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
}

function cancelChunkWait(runtime: SiSentinelAoiWmsPingPongRuntime, chunkKey: string): PingPongChunkState {
  const state = runtime.chunks.get(chunkKey)
  state?.waitCleanup?.()
  const next: PingPongChunkState = {
    activeSlot: state?.activeSlot ?? 0,
    activeUrl: state?.activeUrl ?? '',
    pendingUrl: '',
    waitCleanup: null,
  }
  runtime.chunks.set(chunkKey, next)
  return next
}

function scheduleVisibleWhenReady(
  map: MapboxMap,
  stack: SiSentinelAoiWmsStackState,
  chunkIdx: number,
  runtime: SiSentinelAoiWmsPingPongRuntime,
  slot: SiSentinelAoiWmsPingPongSlot,
  url: string,
  presentation: { visible: boolean; opacity: number },
  options?: { pendingUrl?: string; keepActiveSlot?: SiSentinelAoiWmsPingPongSlot },
): void {
  const chunkKey = siSentinelAoiWmsChunkKey(stack.idPrefix, chunkIdx)
  const prev = runtime.chunks.get(chunkKey)
  prev?.waitCleanup?.()
  const activeSlot = options?.keepActiveSlot ?? prev?.activeSlot ?? 0
  const sourceId = siSentinelAoiWmsPingPongSourceId(stack.idPrefix, chunkIdx, slot)
  const pendingUrl = options?.pendingUrl !== undefined ? options.pendingUrl : url

  applyChunkPresentation(map, stack, chunkIdx, slot, false, presentation.opacity)
  if (activeSlot !== slot && presentation.visible) {
    applyChunkPresentation(map, stack, chunkIdx, activeSlot, true, presentation.opacity)
  }

  const cleanup = waitForSourceReady(
    map,
    sourceId,
    () => {
      commitActiveSlot(map, stack, chunkIdx, runtime, slot, url, presentation)
    },
    { skipImmediate: true },
  )

  runtime.chunks.set(chunkKey, {
    activeSlot,
    activeUrl: prev?.activeUrl ?? '',
    pendingUrl,
    waitCleanup: cleanup,
  })
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
  const state = runtime.chunks.get(chunkKey)
  const activeSlot = state?.activeSlot ?? 0
  const activeUrl = state?.activeUrl ?? ''

  syncChunkBoundsBothSlots(map, stack, chunkIdx, runtime)

  if (activeUrl === url) {
    state?.waitCleanup?.()
    if (presentation.visible && !map.isSourceLoaded(
      siSentinelAoiWmsPingPongSourceId(stack.idPrefix, chunkIdx, activeSlot),
    )) {
      scheduleVisibleWhenReady(map, stack, chunkIdx, runtime, activeSlot, url, presentation, {
        keepActiveSlot: activeSlot,
        pendingUrl: '',
      })
      return
    }
    cancelChunkWait(runtime, chunkKey)
    applyChunkPresentation(map, stack, chunkIdx, activeSlot, presentation.visible, presentation.opacity)
    applyChunkPresentation(map, stack, chunkIdx, otherSlot(activeSlot), false, presentation.opacity)
    runtime.chunks.set(chunkKey, {
      activeSlot,
      activeUrl: url,
      pendingUrl: '',
      waitCleanup: null,
    })
    return
  }

  state?.waitCleanup?.()

  if (!activeUrl) {
    const sourceId = siSentinelAoiWmsPingPongSourceId(stack.idPrefix, chunkIdx, activeSlot)
    const src = readRasterSource(map, sourceId)
    syncSiSentinelAoiWmsChunkTiles(src, url, runtime.appliedUrls, slotUrlKey(chunkKey, activeSlot))

    if (presentation.visible) {
      if (map.isSourceLoaded(sourceId)) {
        commitActiveSlot(map, stack, chunkIdx, runtime, activeSlot, url, presentation)
      } else {
        scheduleVisibleWhenReady(map, stack, chunkIdx, runtime, activeSlot, url, presentation)
      }
      return
    }

    commitActiveSlot(map, stack, chunkIdx, runtime, activeSlot, url, presentation)
    return
  }

  const inactiveSlot = otherSlot(activeSlot)
  const inactiveUrlKey = slotUrlKey(chunkKey, inactiveSlot)
  const inactiveSourceId = siSentinelAoiWmsPingPongSourceId(stack.idPrefix, chunkIdx, inactiveSlot)
  const inactiveSrc = readRasterSource(map, inactiveSourceId)
  const tilesChanged = syncSiSentinelAoiWmsChunkTiles(
    inactiveSrc,
    url,
    runtime.appliedUrls,
    inactiveUrlKey,
  )

  if (!presentation.visible) {
    if (!tilesChanged && map.isSourceLoaded(inactiveSourceId)) {
      commitActiveSlot(map, stack, chunkIdx, runtime, inactiveSlot, url, presentation)
    } else {
      scheduleVisibleWhenReady(map, stack, chunkIdx, runtime, inactiveSlot, url, presentation, {
        pendingUrl: url,
      })
    }
    return
  }

  if (!tilesChanged && map.isSourceLoaded(inactiveSourceId)) {
    commitActiveSlot(map, stack, chunkIdx, runtime, inactiveSlot, url, presentation)
    return
  }

  applyChunkPresentation(map, stack, chunkIdx, activeSlot, true, presentation.opacity)
  applyChunkPresentation(map, stack, chunkIdx, inactiveSlot, false, presentation.opacity)

  const cleanup = waitForSourceReady(
    map,
    inactiveSourceId,
    () => {
      commitActiveSlot(map, stack, chunkIdx, runtime, inactiveSlot, url, presentation)
    },
    { skipImmediate: tilesChanged },
  )

  runtime.chunks.set(chunkKey, {
    activeSlot,
    activeUrl,
    pendingUrl: url,
    waitCleanup: cleanup,
  })
}

/**
 * Warm prefetch at opacity 0 — loads WMS tiles before Show on map.
 */
export function prefetchSiSentinelAoiWmsPingPongStack(
  map: MapboxMap,
  stack: SiSentinelAoiWmsStackState,
  runtime: SiSentinelAoiWmsPingPongRuntime,
  opacity: number,
): void {
  syncSiSentinelAoiWmsPingPongStack(map, stack, runtime, { visible: false, opacity })
}

/**
 * Visibility-only show when warm prefetch finished — instant Show on map (~1s).
 * Falls back to sync-with-wait when tiles are still streaming.
 */
export function revealSiSentinelAoiWmsPingPongStack(
  map: MapboxMap,
  stack: SiSentinelAoiWmsStackState,
  runtime: SiSentinelAoiWmsPingPongRuntime,
  presentation: { visible: boolean; opacity: number },
): void {
  if (!stack.displayChunks.length) return
  if (siSentinelAoiWmsPingPongStackTilesLoaded(map, stack, runtime)) {
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
