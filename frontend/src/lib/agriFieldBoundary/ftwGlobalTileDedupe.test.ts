import { describe, expect, it } from 'vitest'
import { dedupeFtwTileFeatures, ftwFeatureStableKey } from './ftwGlobalTileDedupe'

function square(
  minX: number,
  minY: number,
  size: number,
  props?: Record<string, unknown>,
): GeoJSON.Feature {
  return {
    type: 'Feature',
    properties: props ?? {},
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [minX, minY],
          [minX + size, minY],
          [minX + size, minY + size],
          [minX, minY + size],
          [minX, minY],
        ],
      ],
    },
  }
}

describe('ftwGlobalTileDedupe', () => {
  it('ftwFeatureStableKey prefers explicit id', () => {
    const f = square(0, 0, 0.01, { field_id: 'abc-123' })
    expect(ftwFeatureStableKey(f)).toBe('id:abc-123')
  })

  it('dedupeFtwTileFeatures drops identical tile-boundary duplicates', () => {
    const a = square(0.1, 0.2, 0.01, { confidence_mean: 0.5, field_id: 'dup-1' })
    const b = square(0.1, 0.2, 0.01, { confidence_mean: 0.4, field_id: 'dup-1' })
    const out = dedupeFtwTileFeatures([a, b])
    expect(out).toHaveLength(1)
    expect((out[0]!.properties as Record<string, unknown>).confidence_mean).toBe(0.5)
  })

  it('dedupeFtwTileFeatures resolves stacked copies without shared id', () => {
    const winner = square(0, 0, 0.02, { confidence_mean: 0.55 })
    const stack = square(0.001, 0.001, 0.019, { confidence_mean: 0.35 })
    const out = dedupeFtwTileFeatures([winner, stack])
    expect(out.length).toBeLessThanOrEqual(1)
  })
})
