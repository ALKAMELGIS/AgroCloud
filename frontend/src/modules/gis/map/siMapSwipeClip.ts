import type { Map as MapboxMap } from 'mapbox-gl'

/** After-side raster layers on the main map. Before layers use `si-swipe-before`. */
export const SI_MAP_SWIPE_AFTER_PREFIX = 'si-swipe-after'

export type DrapedBatchRange = { start: number; end: number }

export function layerIdIsSwipeAfter(id: string | undefined): boolean {
  return typeof id === 'string' && id.startsWith(SI_MAP_SWIPE_AFTER_PREFIX)
}

/**
 * Split a draped batch wherever the layer run changes between Before and After
 * so the After composite can be clipped without a second map.
 */
export function splitDrapedBatchesBySwipe(
  batches: readonly DrapedBatchRange[],
  layerIdAt: (styleIndex: number) => string | undefined,
): DrapedBatchRange[] {
  const out: DrapedBatchRange[] = []
  for (const batch of batches) {
    if (batch.end < batch.start) continue
    let start = batch.start
    let prevAfter = layerIdIsSwipeAfter(layerIdAt(start))
    for (let i = batch.start + 1; i <= batch.end; i += 1) {
      const after = layerIdIsSwipeAfter(layerIdAt(i))
      if (after === prevAfter) continue
      out.push({ start, end: i - 1 })
      start = i
      prevAfter = after
    }
    out.push({ start, end: batch.end })
  }
  return out
}

export function batchContainsSwipeAfter(
  batch: DrapedBatchRange,
  layerIdAt: (styleIndex: number) => string | undefined,
): boolean {
  for (let i = batch.start; i <= batch.end; i += 1) {
    if (layerIdIsSwipeAfter(layerIdAt(i))) return true
  }
  return false
}

type ClipState = { split: number }

const clipByMap = new WeakMap<object, ClipState>()

function withScreenScissor(
  gl: WebGL2RenderingContext,
  canvas: HTMLCanvasElement,
  split: number,
  draw: () => void,
) {
  const width = canvas.width
  const height = canvas.height
  const t = Math.min(0.95, Math.max(0.05, split))
  const x = Math.round(width * t)
  const scissorOn = gl.isEnabled(gl.SCISSOR_TEST)
  const box = gl.getParameter(gl.SCISSOR_BOX) as Int32Array
  gl.enable(gl.SCISSOR_TEST)
  gl.scissor(x, 0, Math.max(0, width - x), height)
  try {
    draw()
  } finally {
    if (scissorOn) gl.scissor(box[0] ?? 0, box[1] ?? 0, box[2] ?? 0, box[3] ?? 0)
    else gl.disable(gl.SCISSOR_TEST)
  }
}

type PainterLike = {
  context?: { gl?: WebGL2RenderingContext }
  terrain?: TerrainLike | null
  renderLayer: (...args: unknown[]) => unknown
  __siSwipeClip?: boolean
}

type TerrainLike = {
  _style?: { order?: string[]; _mergedLayers?: Record<string, { id?: string }> }
  _drapedRenderBatches?: DrapedBatchRange[]
  _setupDrapedRenderBatches: () => void
  renderBatch: (index: number) => number
  renderToBackBuffer: (tiles: unknown) => void
  __siSwipeClip?: boolean
  __siSwipeClipThisBatch?: boolean
}

function layerIdFromStyle(terrain: TerrainLike, index: number): string | undefined {
  const order = terrain._style?.order
  const id = order?.[index]
  if (!id) return undefined
  return terrain._style?._mergedLayers?.[id]?.id ?? id
}

function installClipHooks(map: MapboxMap, state: ClipState) {
  const painter = (map as unknown as { painter?: PainterLike }).painter
  if (!painter || painter.__siSwipeClip) return
  painter.__siSwipeClip = true

  const origRenderLayer = painter.renderLayer
  painter.renderLayer = function renderLayerClipped(this: unknown, ...args: unknown[]) {
    const layer = args[2] as { id?: string } | undefined
    const terrainOn = typeof map.getTerrain === 'function' && map.getTerrain() != null
    const active = clipByMap.get(map)
    const gl = painter.context?.gl
    if (!terrainOn && active && gl && layerIdIsSwipeAfter(layer?.id)) {
      return withScreenScissor(gl, map.getCanvas(), active.split, () => origRenderLayer.apply(this, args))
    }
    return origRenderLayer.apply(this, args)
  }

  const wrapTerrain = () => {
    const terrain = painter.terrain
    if (!terrain || terrain.__siSwipeClip) return
    terrain.__siSwipeClip = true
    const origSetup = terrain._setupDrapedRenderBatches
    const origBatch = terrain.renderBatch
    const origBack = terrain.renderToBackBuffer

    terrain._setupDrapedRenderBatches = function setupBatches(this: TerrainLike) {
      origSetup.call(this)
      this._drapedRenderBatches = splitDrapedBatchesBySwipe(this._drapedRenderBatches ?? [], index =>
        layerIdFromStyle(this, index),
      )
    }

    terrain.renderBatch = function renderBatch(this: TerrainLike, index: number) {
      const batch = this._drapedRenderBatches?.[0]
      const active = clipByMap.get(map)
      this.__siSwipeClipThisBatch = !!(
        active &&
        batch &&
        batchContainsSwipeAfter(batch, i => layerIdFromStyle(this, i))
      )
      return origBatch.call(this, index)
    }

    terrain.renderToBackBuffer = function renderToBackBuffer(this: TerrainLike, tiles: unknown) {
      const active = clipByMap.get(map)
      const gl = painter.context?.gl
      if (!this.__siSwipeClipThisBatch || !active || !gl) return origBack.call(this, tiles)
      return withScreenScissor(gl, map.getCanvas(), active.split, () => origBack.call(this, tiles))
    }
  }

  wrapTerrain()
  map.on('render', wrapTerrain)
}

/**
 * Clip the After raster on the main map. `null` turns the clip off without
 * moving the camera or creating another map.
 */
export function setMapSwipeClip(map: MapboxMap | null | undefined, splitPercent: number | null): void {
  if (!map) return
  try {
    if (splitPercent == null) {
      clipByMap.delete(map)
      map.triggerRepaint()
      return
    }
    let state = clipByMap.get(map)
    if (!state) {
      state = { split: splitPercent / 100 }
      clipByMap.set(map, state)
      installClipHooks(map, state)
    }
    state.split = Math.min(95, Math.max(5, splitPercent)) / 100
    map.triggerRepaint()
  } catch {
    /* map is tearing down */
  }
}
