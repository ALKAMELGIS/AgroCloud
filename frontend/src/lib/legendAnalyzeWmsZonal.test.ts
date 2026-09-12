import { describe, expect, it } from 'vitest'
import {
  LEGEND_ANALYZE_LARGE_AOI_HA,
  mergeTileIndexStats,
  normalizeLegendWmsZonalLayerKey,
  splitBbox3857ForZonalTiles,
} from './legendAnalyzeWmsZonal'

describe('legendAnalyzeWmsZonal', () => {
  it('normalizes delta and alias layer ids', () => {
    expect(normalizeLegendWmsZonalLayerKey('DNDMI')).toBe('NDMI')
    expect(normalizeLegendWmsZonalLayerKey('NDII')).toBe('NDMI')
    expect(normalizeLegendWmsZonalLayerKey('NDSI')).toBe('SSI')
  })

  it('returns single tile for small AOI', () => {
    const bbox: [number, number, number, number] = [0, 0, 1000, 1000]
    expect(splitBbox3857ForZonalTiles(bbox, LEGEND_ANALYZE_LARGE_AOI_HA - 1)).toEqual([bbox])
  })

  it('splits large AOI into multiple tiles', () => {
    const bbox: [number, number, number, number] = [0, 0, 10_000, 10_000]
    const tiles = splitBbox3857ForZonalTiles(bbox, 50_000)
    expect(tiles.length).toBeGreaterThan(1)
    expect(tiles.length).toBeLessThanOrEqual(16)
  })

  it('mergeTileIndexStats weights means by sample count', () => {
    const merged = mergeTileIndexStats([
      { min: 0.1, max: 0.5, mean: 0.3, sampleCount: 100 },
      { min: 0.2, max: 0.8, mean: 0.6, sampleCount: 300 },
    ])
    expect(merged?.min).toBeCloseTo(0.1)
    expect(merged?.max).toBeCloseTo(0.8)
    expect(merged?.mean).toBeCloseTo(0.525)
    expect(merged?.sampleCount).toBe(400)
  })
})
