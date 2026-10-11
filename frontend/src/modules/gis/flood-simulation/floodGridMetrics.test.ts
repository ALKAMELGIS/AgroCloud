import { describe, expect, it } from 'vitest'
import { computeFrameMetrics } from './floodGridMetrics'

describe('floodGridMetrics', () => {
  it('computes flooded area from depth threshold', () => {
    const depth = new Float32Array([0, 0.1, 0.2, 0])
    const mask = new Uint8Array([1, 1, 1, 1])
    const m = computeFrameMetrics(depth, mask, 10, 0.05)
    expect(m.floodedAreaHa).toBeGreaterThan(0)
    expect(m.maxDepthM).toBeCloseTo(0.2, 5)
  })
})
