import { describe, expect, it } from 'vitest'
import {
  iterSegFormerTiles,
  normalizeSegFormerOverlap,
  normalizeSegFormerTileSize,
  segFormerOverlapPixels,
  stitchSegFormerTilePredictions,
  SEGFORMER_DEFAULT_OVERLAP,
  SEGFORMER_DEFAULT_TILE_SIZE,
} from './segformerTiling'

describe('segformerTiling', () => {
  it('normalizes tile size to allowed presets including 640', () => {
    expect(normalizeSegFormerTileSize(256)).toBe(256)
    expect(normalizeSegFormerTileSize(640)).toBe(640)
    expect(normalizeSegFormerTileSize(1024)).toBe(1024)
    expect(normalizeSegFormerTileSize(512)).toBe(512)
    expect(normalizeSegFormerTileSize(300)).toBe(256) // nearest allowed
    expect(normalizeSegFormerTileSize(700)).toBe(640)
  })

  it('normalizes overlap as fraction or percent', () => {
    expect(normalizeSegFormerOverlap(0.2)).toBe(0.2)
    expect(normalizeSegFormerOverlap(20)).toBe(0.2)
    expect(normalizeSegFormerOverlap(SEGFORMER_DEFAULT_OVERLAP)).toBe(0.2)
    expect(normalizeSegFormerOverlap(0.9)).toBe(0.5)
    expect(normalizeSegFormerOverlap(Number.NaN)).toBe(SEGFORMER_DEFAULT_OVERLAP)
  })

  it('returns a single window when the image fits in one tile', () => {
    expect(iterSegFormerTiles(400, 300, 512, 100)).toEqual([
      { y0: 0, y1: 400, x0: 0, x1: 300 },
    ])
  })

  it('covers a large image with overlapping tiles', () => {
    const tile = 512
    const overlapPx = segFormerOverlapPixels(tile, 0.2)
    expect(overlapPx).toBe(Math.round(512 * 0.2))
    const tiles = iterSegFormerTiles(1200, 1000, tile, overlapPx)
    expect(tiles.length).toBeGreaterThan(1)
    // Full coverage: every pixel belongs to at least one tile.
    const covered = Array.from({ length: 1200 }, () => Array(1000).fill(false))
    for (const t of tiles) {
      for (let y = t.y0; y < t.y1; y++) {
        for (let x = t.x0; x < t.x1; x++) covered[y]![x] = true
      }
    }
    expect(covered.every(row => row.every(Boolean))).toBe(true)
    // Tile dims never exceed tile size.
    for (const t of tiles) {
      expect(t.y1 - t.y0).toBeLessThanOrEqual(tile)
      expect(t.x1 - t.x0).toBeLessThanOrEqual(tile)
    }
  })

  it('stitches overlapping tile predictions by max confidence', () => {
    // 4x4 canvas, two 3x3 tiles overlapping on column 1..2
    const tiles = [
      {
        window: { y0: 0, y1: 3, x0: 0, x1: 3 },
        labels: [
          1, 1, 1,
          1, 1, 1,
          1, 1, 1,
        ],
        conf: [
          0.9, 0.9, 0.4,
          0.9, 0.9, 0.4,
          0.9, 0.9, 0.4,
        ],
      },
      {
        window: { y0: 0, y1: 3, x0: 1, x1: 4 },
        labels: [
          2, 2, 2,
          2, 2, 2,
          2, 2, 2,
        ],
        conf: [
          0.3, 0.8, 0.8,
          0.3, 0.8, 0.8,
          0.3, 0.8, 0.8,
        ],
      },
    ]
    const { labels, conf } = stitchSegFormerTilePredictions({
      height: 3,
      width: 4,
      tiles,
    })
    // Col 0: only tile A → label 1
    expect(labels[0]).toBe(1)
    expect(conf[0]).toBeCloseTo(0.9)
    // Col 1 (overlap): tile A conf 0.9 > tile B 0.3 → label 1
    expect(labels[1]).toBe(1)
    expect(conf[1]).toBeCloseTo(0.9)
    // Col 2 (overlap): tile B conf 0.8 > tile A 0.4 → label 2
    expect(labels[2]).toBe(2)
    expect(conf[2]).toBeCloseTo(0.8)
    // Col 3: only tile B → label 2
    expect(labels[3]).toBe(2)
    expect(conf[3]).toBeCloseTo(0.8)
  })
})
