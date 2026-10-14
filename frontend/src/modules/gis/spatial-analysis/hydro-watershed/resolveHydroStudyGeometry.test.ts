import { describe, expect, it } from 'vitest'
import { resolveHydroStudyGeometry } from './resolveHydroStudyGeometry'

const square: GeoJSON.Polygon = {
  type: 'Polygon',
  coordinates: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ],
  ],
}

describe('resolveHydroStudyGeometry', () => {
  it('prefers drawn sketch over layer mask', () => {
    const drawn = { type: 'Feature' as const, properties: {}, geometry: square }
    const layers: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: square }],
    }
    expect(resolveHydroStudyGeometry(drawn, true, layers)).toBe(drawn)
  })

  it('uses layer mask when enabled and no sketch', () => {
    const layers: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: square }],
    }
    expect(resolveHydroStudyGeometry(null, true, layers)).toBe(layers)
  })

  it('ignores layer mask when AOI mask is disabled', () => {
    const layers: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: square }],
    }
    expect(resolveHydroStudyGeometry(null, false, layers)).toBeNull()
  })
})
