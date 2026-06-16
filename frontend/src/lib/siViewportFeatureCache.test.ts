import { describe, expect, it } from 'vitest'
import { SiViewportFeatureCache } from './siViewportFeatureCache'

describe('SiViewportFeatureCache', () => {
  it('isPrefetchCovered requires the actual prefetch bbox, not only quantized tile', () => {
    const cache = new SiViewportFeatureCache()
    const first: [number, number, number, number] = [55.0, 25.0, 55.04, 25.04]
    const shifted: [number, number, number, number] = [55.08, 25.08, 55.12, 25.12]

    expect(cache.isPrefetchCovered(first)).toBe(false)
    cache.markTileFetched(first)
    expect(cache.isPrefetchCovered(first)).toBe(true)
    expect(cache.isPrefetchCovered(shifted)).toBe(false)
  })
})
