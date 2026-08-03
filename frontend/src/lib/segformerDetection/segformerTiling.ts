/**
 * Pure tile-window helpers for SegFormer large-image inference.
 * Mirrors backend/services/segformer-detection/app.py `_iter_tiles` /
 * overlap→pixel conversion so client tests can lock the contract.
 */

export const SEGFORMER_TILE_SIZES = [256, 512, 640, 1024] as const
export type SegFormerTileSize = (typeof SEGFORMER_TILE_SIZES)[number]

export const SEGFORMER_DEFAULT_TILE_SIZE: SegFormerTileSize = 512
/** Preferred tile when running B5 ADE20K-640 (UI 512 maps here on the service). */
export const SEGFORMER_B5_TILE_SIZE: SegFormerTileSize = 640
/** Default overlap as a fraction of tile size (20%). */
export const SEGFORMER_DEFAULT_OVERLAP = 0.2
/** Field pipeline Detect defaults (agriculture-field-boundary). */
export const SEGFORMER_FIELD_DEFAULT_MIN_CONFIDENCE = 0.4
export const SEGFORMER_FIELD_DEFAULT_OVERLAP = 0.2
export const SEGFORMER_FIELD_DEFAULT_TILE_SIZE: SegFormerTileSize = 640

export type SegFormerTileWindow = {
  y0: number
  y1: number
  x0: number
  x1: number
}

/** Clamp overlap to a usable fraction of tile size (0..0.5). */
export function normalizeSegFormerOverlap(overlap: number): number {
  if (!Number.isFinite(overlap)) return SEGFORMER_DEFAULT_OVERLAP
  // Accept either 0..1 fraction or 1..50 percent.
  const frac = overlap > 1 ? overlap / 100 : overlap
  return Math.max(0, Math.min(0.5, frac))
}

export function normalizeSegFormerTileSize(tileSize: number): SegFormerTileSize {
  if (tileSize === 256 || tileSize === 640 || tileSize === 1024) return tileSize
  // Nearest allowed preset for arbitrary values (e.g. 500 → 512, 700 → 640).
  if (!Number.isFinite(tileSize)) return 512
  let best: SegFormerTileSize = 512
  let bestDist = Infinity
  for (const t of SEGFORMER_TILE_SIZES) {
    const d = Math.abs(t - tileSize)
    if (d < bestDist) {
      bestDist = d
      best = t
    }
  }
  return best
}

/** Overlap in pixels for a given tile size + fraction. */
export function segFormerOverlapPixels(tileSize: number, overlapFrac: number): number {
  const tile = Math.max(32, Math.floor(tileSize))
  const frac = normalizeSegFormerOverlap(overlapFrac)
  return Math.max(0, Math.min(tile - 1, Math.round(tile * frac)))
}

/**
 * Return (y0,y1,x0,x1) windows covering HxW with the given tile size and
 * pixel overlap. Single-tile when the image fits.
 */
export function iterSegFormerTiles(
  height: number,
  width: number,
  tileSize: number,
  overlapPixels: number,
): SegFormerTileWindow[] {
  const h = Math.max(0, Math.floor(height))
  const w = Math.max(0, Math.floor(width))
  if (h <= 0 || w <= 0) return []

  const tile = Math.max(32, Math.floor(tileSize))
  if (h <= tile && w <= tile) {
    return [{ y0: 0, y1: h, x0: 0, x1: w }]
  }

  const overlap = Math.max(0, Math.min(tile - 1, Math.floor(overlapPixels)))
  const step = Math.max(32, tile - overlap)
  const tiles: SegFormerTileWindow[] = []
  const seen = new Set<string>()

  for (let y = 0; y < h; y += step) {
    let y0 = y
    let y1 = Math.min(h, y0 + tile)
    if (y1 - y0 < tile && y0 > 0) y0 = Math.max(0, y1 - tile)
    for (let x = 0; x < w; x += step) {
      let x0 = x
      let x1 = Math.min(w, x0 + tile)
      if (x1 - x0 < tile && x0 > 0) x0 = Math.max(0, x1 - tile)
      const key = `${y0},${y1},${x0},${x1}`
      if (!seen.has(key)) {
        seen.add(key)
        tiles.push({ y0, y1, x0, x1 })
      }
      if (x1 >= w) break
    }
    if (y1 >= h) break
  }
  return tiles
}

/**
 * Stitch per-tile label + confidence maps into full-size arrays.
 * Overlap resolution: keep the prediction with higher confidence.
 *
 * Pure / testable — `labels`/`conf` are flat row-major typed arrays
 * (or number[]) of length height*width.
 */
export function stitchSegFormerTilePredictions(opts: {
  height: number
  width: number
  tiles: Array<{
    window: SegFormerTileWindow
    /** Tile labels, length = (y1-y0)*(x1-x0). */
    labels: ArrayLike<number>
    /** Tile confidences 0..1, same length as labels. */
    conf: ArrayLike<number>
  }>
}): { labels: Float64Array; conf: Float32Array } {
  const { height: h, width: w, tiles } = opts
  const labels = new Float64Array(h * w)
  const conf = new Float32Array(h * w)

  for (const t of tiles) {
    const { y0, y1, x0, x1 } = t.window
    const th = y1 - y0
    const tw = x1 - x0
    for (let row = 0; row < th; row++) {
      for (let col = 0; col < tw; col++) {
        const ti = row * tw + col
        const c = Number(t.conf[ti]) || 0
        const gi = (y0 + row) * w + (x0 + col)
        if (c >= conf[gi]!) {
          conf[gi] = c
          labels[gi] = Number(t.labels[ti]) || 0
        }
      }
    }
  }
  return { labels, conf }
}
