import { describe, expect, it } from 'vitest'
import { rainMotionFromIntensity } from './weatherSimModel'

describe('rainMotionFromIntensity', () => {
  it('draws no drops at 0%', () => {
    expect(rainMotionFromIntensity(0).dropCount).toBe(0)
  })

  it('raises density and fall speed as intensity goes from light rain to a downpour', () => {
    const low = rainMotionFromIntensity(10)
    const mid = rainMotionFromIntensity(50)
    const high = rainMotionFromIntensity(100)
    expect(low.dropCount).toBeGreaterThan(0)
    expect(mid.dropCount).toBeGreaterThan(low.dropCount)
    expect(high.dropCount).toBeGreaterThan(mid.dropCount)
    expect(mid.fallSpeedPx).toBeGreaterThan(low.fallSpeedPx)
    expect(high.fallSpeedPx).toBeGreaterThan(mid.fallSpeedPx)
    expect(low.fallSpeedPx).toBeLessThan(400)
    expect(high.fallSpeedPx).toBeGreaterThan(1000)
    expect(high.streakScale).toBeGreaterThan(low.streakScale)
  })
})