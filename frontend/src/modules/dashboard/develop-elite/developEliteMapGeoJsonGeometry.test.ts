import { describe, expect, it } from 'vitest'
import {
  developEliteMapPointZoomScale,
  isDevelopElitePointOnlyArcgisGeoJson,
} from './developEliteMapGeoJsonGeometry'

describe('isDevelopElitePointOnlyArcgisGeoJson', () => {
  it('returns true for point-only collections', () => {
    expect(
      isDevelopElitePointOnlyArcgisGeoJson([
        { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: {} },
      ]),
    ).toBe(true)
  })

  it('returns false when lines are present', () => {
    expect(
      isDevelopElitePointOnlyArcgisGeoJson([
        { type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] }, properties: {} },
      ]),
    ).toBe(false)
  })
})

describe('developEliteMapPointZoomScale', () => {
  it('is smaller when zoomed out', () => {
    expect(developEliteMapPointZoomScale(6)).toBeLessThan(developEliteMapPointZoomScale(16))
  })
})
