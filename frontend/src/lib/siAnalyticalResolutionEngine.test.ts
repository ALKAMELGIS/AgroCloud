import { describe, expect, it } from 'vitest'
import {
  ANALYTICAL_INSIGHT_GSD_M,
  aggregateObjectBasedIndex,
  applyAnalyticalResolutionToZonalMean,
  buildSuperpixelCentroidsForRing,
  computeTemporalAnalyticalEnhancement,
  fuseHighResolutionSample,
  injectAnalyticalResolutionIntoEvalscript,
  isAnalyticalResolutionLayer,
  resolveAnalyticalResolutionMeta,
} from './siAnalyticalResolutionEngine'
import { buildSentinelNdviTenClassEvalscript } from './sentinelHubWmsIndexEvalscripts'
import { buildAgroCompositeEvalscript } from './agroCompositeIndexEvalscripts'

describe('siAnalyticalResolutionEngine', () => {
  it('identifies analytical layers but not RGB presets', () => {
    expect(isAnalyticalResolutionLayer('NDVI')).toBe(true)
    expect(isAnalyticalResolutionLayer('VHS')).toBe(true)
    expect(isAnalyticalResolutionLayer('DCHAS')).toBe(true)
    expect(isAnalyticalResolutionLayer('TRUE_COLOR')).toBe(false)
    expect(isAnalyticalResolutionLayer('Highlight Optimized Natural Color')).toBe(false)
  })

  it('injects ARE sub-pixel block into NDVI evalscript', () => {
    const raw = buildSentinelNdviTenClassEvalscript(null)
    const enhanced = injectAnalyticalResolutionIntoEvalscript(raw, 'NDVI')
    expect(enhanced).toContain('ARE_ANALYTICAL_RESOLUTION_V1')
    expect(enhanced).toContain('areAnalyticalIndex')
    expect(enhanced).toContain('B8A')
  })

  it('injects ARE into composite evalscripts', () => {
    const raw = buildAgroCompositeEvalscript('CHAS', null)
    expect(raw).toBeTruthy()
    const enhanced = injectAnalyticalResolutionIntoEvalscript(raw!, 'CHAS')
    expect(enhanced).toContain('areSubPixelBlend')
  })

  it('builds superpixel centroids inside a square field', () => {
    const ring: [number, number][] = [
      [46.6, 24.7],
      [46.601, 24.7],
      [46.601, 24.701],
      [46.6, 24.701],
      [46.6, 24.7],
    ]
    const cells = buildSuperpixelCentroidsForRing(ring, ANALYTICAL_INSIGHT_GSD_M)
    expect(cells.length).toBeGreaterThan(4)
  })

  it('aggregates object-based samples and temporal deltas', () => {
    const agg = aggregateObjectBasedIndex([
      { lng: 0, lat: 0, weight: 1, ndvi: 0.5, ndmi: 0.2, ndwi: 0.1 },
      { lng: 0, lat: 0, weight: 1, ndvi: 0.52, ndmi: 0.21, ndwi: 0.11 },
    ])
    expect(agg?.ndvi).toBeCloseTo(0.51, 2)
    expect(agg?.chas).toBeGreaterThan(0)

    const temporal = computeTemporalAnalyticalEnhancement(
      { ndvi: 0.4, ndmi: 0.15, ndwi: 0.08 },
      { ndvi: 0.55, ndmi: 0.2, ndwi: 0.1 },
    )
    expect(temporal.deltaNdvi).toBeLessThan(0)
    expect(temporal.deltaChas).toBeLessThan(0)
    expect(temporal.insightScore).toBeGreaterThan(0)
  })

  it('fuses optional high-resolution source without replacing Sentinel base', () => {
    const fused = fuseHighResolutionSample(
      { ndvi: 0.5, ndmi: 0.2, ndwi: 0.1 },
      { ndvi: 0.62, ndmi: 0.24, ndwi: 0.12 },
    )
    expect(fused.fused).toBe(true)
    expect(fused.ndvi).toBeGreaterThan(0.5)
    expect(fused.ndvi).toBeLessThan(0.62)
  })

  it('stabilizes zonal means with object sample count', () => {
    const low = applyAnalyticalResolutionToZonalMean(0.42, 2)
    const high = applyAnalyticalResolutionToZonalMean(0.42, 24)
    expect(high).not.toBe(low)
  })

  it('documents native vs analytical resolution honestly', () => {
    const meta = resolveAnalyticalResolutionMeta()
    expect(meta.nativeGsdM).toBe(10)
    expect(meta.insightGsdM).toBe(10)
    expect(meta.badgeShort).toContain('10m')
  })
})
