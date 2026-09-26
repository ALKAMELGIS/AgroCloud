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
  /**
   * Visible date swaps ease opacity over this many milliseconds.
   * 0 keeps the historical hard cut (unit tests and first paint).
   */
  crossfadeMs: number
  /** Chunks whose opacity is mid requestAnimationFrame cross-fade. */
  fadingChunks: Set<string>
  fadeRafIds: number[]
  /** Tile URLs that have finished loading on a ping-pong slot. */
  readyUrls: Set<string>
  /** Latest blend frame, reapplied when the incoming date finishes loading. */
  latestBlend: { stack: SiSentinelAoiWmsStackState; frame: SiSentinelAoiWmsBlendFrame } | null
  blendWaits: Map<string, () => void>
  blendDepth?: number
}

export function createSiSentinelAoiWmsPingPongRuntime(): SiSentinelAoiWmsPingPongRuntime {
  return {
    chunks: new Map(),
    appliedUrls: new Map(),
    appliedBounds: new Map(),
    mountedChunkCount: 0,
    crossfadeMs: 0,
    fadingChunks: new Set(),
    fadeRafIds: [],
    readyUrls: new Set(),
    latestBlend: null,
    blendWaits: new Map(),
  }
}

function cancelPingPongFades(runtime: SiSentinelAoiWmsPingPongRuntime): void {
  if (!runtime.fadeRafIds) runtime.fadeRafIds = []
  if (!runtime.fadingChunks) runtime.fadingChunks = new Set()
  if (typeof cancelAnimationFrame === 'function') {
    for (const id of runtime.fadeRafIds) cancelAnimationFrame(id)
  }
  runtime.fadeRafIds = []
  runtime.fadingChunks.clear()
}

export function resetSiSentinelAoiWmsPingPongRuntime(runtime: SiSentinelAoiWmsPingPongRuntime): void {
  for (const state of runtime.chunks.values()) {
    state.waitCleanup?.()
  }
  cancelPingPongFades(runtime)
  runtime.chunks.clear()
  runtime.appliedUrls.clear()
  runtime.appliedBounds.clear()
  runtime.mountedChunkCount = 0
  runtime.readyUrls?.clear()
  runtime.latestBlend = null
  if (runtime.blendWaits) {
    for (const off of runtime.blendWaits.values()) off()
    runtime.blendWaits.clear()
  }
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

function smoothstep(t: number): number {
  const x = Math.max(0, Math.min(1, t))
  return x * x * (3 - 2 * x)
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
  const duration = runtime.crossfadeMs
  const canFade =
    duration > 0 &&
    presentation.visible &&
    prevActive !== nextActive &&
    Boolean(prev?.activeUrl) &&
    typeof requestAnimationFrame === 'function'

  if (!canFade) {
    if (prevActive !== nextActive) {
      applyChunkPresentation(map, stack, chunkIdx, prevActive, false, presentation.opacity)
    }
    applyChunkPresentation(map, stack, chunkIdx, nextActive, presentation.visible, presentation.opacity)
    runtime.fadingChunks?.delete(chunkKey)
    runtime.chunks.set(chunkKey, {
      activeSlot: nextActive,
      activeUrl: url,
      pendingUrl: '',
      waitCleanup: null,
    })
    return
  }

  runtime.fadingChunks.add(chunkKey)
  const fromSlot = prevActive
  const opacity = presentation.opacity
  const started = typeof performance !== 'undefined' ? performance.now() : 0
  const step = (now: number) => {
    if (!runtime.fadingChunks.has(chunkKey)) return
    const t = smoothstep((now - started) / duration)
    applyChunkPresentation(map, stack, chunkIdx, fromSlot, true, opacity * (1 - t))
    applyChunkPresentation(map, stack, chunkIdx, nextActive, true, opacity * t)
    if (t < 1) {
      const id = requestAnimationFrame(step)
      runtime.fadeRafIds.push(id)
      return
    }
    runtime.fadingChunks.delete(chunkKey)
    runtime.chunks.set(chunkKey, {
      activeSlot: nextActive,
      activeUrl: url,
      pendingUrl: '',
      waitCleanup: null,
    })
  }
  const id = requestAnimationFrame(step)
  runtime.fadeRafIds.push(id)
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
  if (runtime.fadingChunks?.has(chunkKey)) {
    runtime.fadingChunks.delete(chunkKey)
  }
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

function slotHoldingUrl(
  runtime: SiSentinelAoiWmsPingPongRuntime,
  chunkKey: string,
  url: string,
): SiSentinelAoiWmsPingPongSlot | null {
  for (const slot of [0, 1] as const) {
    if (runtime.appliedUrls.get(slotUrlKey(chunkKey, slot)) === url) return slot
  }
  return null
}

export type SiSentinelAoiWmsBlendFrame = {
  fromUrls: string[]
  toUrls: string[]
  /** 0 = fully the current date, 1 = fully the next date. */
  t: number
  opacity: number
}

/**
 * Show two dates at once on the existing ping-pong slots.
 * Sources and layers stay mounted; only tile URLs and raster-opacity change.
 * The incoming date stays at opacity 0 until its tiles have loaded, so the
 * map never flashes empty. Does not move the camera.
 */
function watchBlendSlotReady(
  map: MapboxMap,
  runtime: SiSentinelAoiWmsPingPongRuntime,
  sourceId: string,
  url: string,
): void {
  if (!runtime.blendWaits) runtime.blendWaits = new Map()
  if (!runtime.readyUrls) runtime.readyUrls = new Set()
  const key = `${sourceId}\n${url}`
  if (runtime.readyUrls.has(url) || runtime.blendWaits.has(key)) return
  let settled = false
  const finish = () => {
    if (settled) return
    settled = true
    try {
      map.off('sourcedata', handler)
    } catch {
      /* ignore */
    }
    runtime.blendWaits.delete(key)
    runtime.readyUrls.add(url)
    const latest = runtime.latestBlend
    if (!latest || runtime.blendDepth) return
    presentSiSentinelAoiWmsPingPongBlend(map, latest.stack, runtime, latest.frame)
  }
  const handler = (ev: { sourceId?: string; sourceDataType?: string; isSourceLoaded?: boolean }) => {
    if (ev.sourceId !== sourceId) return
    if (ev.sourceDataType === 'metadata') return
    if (ev.isSourceLoaded || ev.sourceDataType === 'idle' || map.isSourceLoaded?.(sourceId)) finish()
  }
  runtime.blendWaits.set(key, () => {
    settled = true
    try {
      map.off('sourcedata', handler)
    } catch {
      /* ignore */
    }
  })
  try {
    map.on('sourcedata', handler)
  } catch {
    runtime.blendWaits.delete(key)
  }
}

export function presentSiSentinelAoiWmsPingPongBlend(
  map: MapboxMap,
  stack: SiSentinelAoiWmsStackState,
  runtime: SiSentinelAoiWmsPingPongRuntime,
  frame: SiSentinelAoiWmsBlendFrame,
): void {
  if (!stack.displayChunks.length) return
  if (!runtime.readyUrls) runtime.readyUrls = new Set()
  runtime.latestBlend = { stack, frame }
  runtime.blendDepth = (runtime.blendDepth ?? 0) + 1
  cancelPingPongFades(runtime)
  ensureSiSentinelAoiWmsPingPongStackOnMap(map, stack, runtime)
  const t = Math.max(0, Math.min(1, frame.t))

  for (let i = 0; i < stack.displayChunks.length; i++) {
    const fromUrl = String(frame.fromUrls[i] ?? stack.tileUrls[i] ?? '').trim()
    const toUrl = String(frame.toUrls[i] ?? fromUrl).trim()
    if (!fromUrl) continue

    const chunkKey = siSentinelAoiWmsChunkKey(stack.idPrefix, i)
    const state = runtime.chunks.get(chunkKey)
    state?.waitCleanup?.()

    const same = !toUrl || toUrl === fromUrl
    let fromSlot: SiSentinelAoiWmsPingPongSlot = state?.activeSlot ?? 0
    if (!same) {
      const holding = slotHoldingUrl(runtime, chunkKey, fromUrl)
      if (holding != null) fromSlot = holding
    }
    const toSlot = otherSlot(fromSlot)

    syncChunkBoundsBothSlots(map, stack, i, runtime)
    syncSiSentinelAoiWmsChunkTiles(
      readRasterSource(map, siSentinelAoiWmsPingPongSourceId(stack.idPrefix, i, fromSlot)),
      fromUrl,
      runtime.appliedUrls,
      slotUrlKey(chunkKey, fromSlot),
    )
    const toTilesChanged =
      !same &&
      syncSiSentinelAoiWmsChunkTiles(
        readRasterSource(map, siSentinelAoiWmsPingPongSourceId(stack.idPrefix, i, toSlot)),
        toUrl,
        runtime.appliedUrls,
        slotUrlKey(chunkKey, toSlot),
      )

    const toSourceId = siSentinelAoiWmsPingPongSourceId(stack.idPrefix, i, toSlot)
    // A fresh setTiles drops the cache. Keep the outgoing date opaque until the
    // incoming tiles have loaded — never a blank frame. Once they have loaded,
    // opacity follows the timeline fraction on every frame.
    if (toTilesChanged && toUrl) runtime.readyUrls.delete(toUrl)
    const toLoadedNow = !toTilesChanged && Boolean(map.isSourceLoaded?.(toSourceId))
    if (toLoadedNow && toUrl) runtime.readyUrls.add(toUrl)
    const toReady = same || (!toTilesChanged && (runtime.readyUrls.has(toUrl) || toLoadedNow))
    if (!same && !toReady && toUrl) watchBlendSlotReady(map, runtime, toSourceId, toUrl)
    const fromOpacity = frame.opacity * (toReady ? 1 - t : 1)
    const toOpacity = same || !toReady ? 0 : frame.opacity * t

    applyChunkPresentation(map, stack, i, fromSlot, fromOpacity > 0.001, fromOpacity)
    applyChunkPresentation(map, stack, i, toSlot, toOpacity > 0.001, toOpacity)

    const showTo = !same && toReady && t >= 0.5
    runtime.chunks.set(chunkKey, {
      activeSlot: showTo ? toSlot : fromSlot,
      activeUrl: showTo ? toUrl : fromUrl,
      pendingUrl: !same && !toReady ? toUrl : '',
      waitCleanup: null,
    })
  }
  runtime.blendDepth = Math.max(0, (runtime.blendDepth ?? 1) - 1)
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
  cancelPingPongFades(runtime)
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
