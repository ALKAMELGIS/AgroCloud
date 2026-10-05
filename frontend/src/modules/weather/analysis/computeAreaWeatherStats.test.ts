import { describe, expect, it } from 'vitest'
import { computeAreaWeatherStats } from './computeAreaWeatherStats'

describe('computeAreaWeatherStats', () => {
  it('computes mean and range for grid samples', () => {
    const stats = computeAreaWeatherStats([
      { lat: 0, lng: 0, value: 10 },
      { lat: 1, lng: 1, value: 20 },
      { lat: 2, lng: 2, value: 30 },
    ])
    expect(stats.count).toBe(3)
    expect(stats.mean).toBe(20)
    expect(stats.min).toBe(10)
    expect(stats.max).toBe(30)
    expect(stats.range).toBe(20)
  })
})
