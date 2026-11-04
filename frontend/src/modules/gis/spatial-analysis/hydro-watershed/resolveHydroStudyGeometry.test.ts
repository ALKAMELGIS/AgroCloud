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
    // Sketch is normalized to its polygonal geometry (Feature unwrapped) via getDrawnGeometry.
    expect(resolveHydroStudyGeometry(drawn, true, layers)).toBe(square)
  })

  it('normalizes a circle sketch (Point + radius) to a Polygon', () => {
    const circle = {
      type: 'Feature' as const,
      properties: { radius: 500 },
      geometry: { type: 'Point' as const, coordinates: [55, 25] },
    }
    const out = resolveHydroStudyGeometry(circle, false, null) as GeoJSON.Polygon | null
    expect(out?.type).toBe('Polygon')
    expect(out?.coordinates[0].length).toBeGreaterThan(8)
  })

  it('falls back to layer mask when the sketch is not polygonal', () => {
    const line = {
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'LineString' as const, coordinates: [[0, 0], [1, 1]] },
    }
    const layers: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: square }],
    }
    expect(resolveHydroStudyGeometry(line, true, layers)).toBe(layers)
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
