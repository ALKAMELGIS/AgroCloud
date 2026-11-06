import { describe, expect, it } from 'vitest'
import { developEliteSwipeClipPath, developEliteWeatherVizMode } from './developEliteMapInsight'

describe('developEliteMapInsight', () => {
  it('clips the after basemap to the right of the divider', () => {
    expect(developEliteSwipeClipPath(800, 0.5)).toBe('inset(0 0 0 400px)')
    expect(developEliteSwipeClipPath(800, 0)).toBe('inset(0 0 0 0px)')
    expect(developEliteSwipeClipPath(100, 2)).toBe('inset(0 0 0 100px)')
  })

  it('maps weather tones onto a canvas mode', () => {
    expect(developEliteWeatherVizMode('rain')).toBe('rain')
    expect(developEliteWeatherVizMode('drizzle')).toBe('rain')
    expect(developEliteWeatherVizMode('storm')).toBe('storm')
    expect(developEliteWeatherVizMode('snow')).toBe('snow')
    expect(developEliteWeatherVizMode('clear')).toBe('clear')
    expect(developEliteWeatherVizMode('fog')).toBe('cloud')
  })
})
