import { describe, expect, it } from 'vitest'
import { interpolateColor, windDirectionColor } from './weatherColorRamp'

describe('weatherColorRamp', () => {
  it('interpolates between stops', () => {
    const stops = [
      { value: 0, color: '#000000' },
      { value: 100, color: '#ffffff' },
    ]
    expect(interpolateColor(stops, 50)).toBe('rgb(128,128,128)')
  })

  it('returns wind direction hsl', () => {
    expect(windDirectionColor(0)).toMatch(/^hsl\(/)
  })
})
