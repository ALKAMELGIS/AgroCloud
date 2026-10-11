import { describe, expect, it } from 'vitest'
import { depthToRgba } from './floodColorRamp'

describe('floodColorRamp', () => {
  it('returns transparent for zero depth', () => {
    expect(depthToRgba(0)[3]).toBe(0)
  })

  it('returns opaque channel for deep water', () => {
    expect(depthToRgba(2.5)[3]).toBeGreaterThan(0.5)
  })
})
