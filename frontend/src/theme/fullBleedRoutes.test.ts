import { describe, expect, it } from 'vitest'
import { isFullBleedMainClass } from './fullBleedRoutes'

describe('isFullBleedMainClass', () => {
  it('detects GIS and dashboard routes', () => {
    expect(isFullBleedMainClass('content content--develop-dashboard')).toBe(true)
    expect(isFullBleedMainClass('content content--agro-cloud-platform')).toBe(true)
    expect(isFullBleedMainClass('content content--weather-intelligence')).toBe(true)
    expect(isFullBleedMainClass('content content--home-landing')).toBe(false)
  })
})
