import { describe, expect, it } from 'vitest'
import {
  mergeFtwSeamTouchingFragments,
  unionFtwFragmentsByFieldId,
} from './ftwHideTileBoundaries'

function rect(
  minX: number,
  minY: number,
  w: number,
  h: number,
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
          [minX + w, minY],
          [minX + w, minY + h],
          [minX, minY + h],
          [minX, minY],
        ],
      ],
    },
  }
}

describe('unionFtwFragmentsByFieldId', () => {
  it('merges two tile fragments with the same field_id', () => {
    const left = rect(0, 0, 0.01, 0.02, { field_id: 'f-42', confidence_mean: 0.5 })
    const right = rect(0.01, 0, 0.01, 0.02, { field_id: 'f-42', confidence_mean: 0.48 })
    const out = unionFtwFragmentsByFieldId([left, right])
    expect(out).toHaveLength(1)
    expect(out[0]!.geometry.type).toMatch(/Polygon|MultiPolygon/)
  })

  it('keeps separate fields with different ids', () => {
    const a = rect(0, 0, 0.01, 0.01, { field_id: 'a' })
    const b = rect(0.02, 0, 0.01, 0.01, { field_id: 'b' })
    const out = unionFtwFragmentsByFieldId([a, b])
    expect(out).toHaveLength(2)
  })
})

describe('mergeFtwSeamTouchingFragments', () => {
  it('merges adjacent tile fragments without shared field_id when they touch on a seam', () => {
    const left = rect(0, 0, 0.01, 0.02, { confidence_mean: 0.5 })
    const right = rect(0.01, 0, 0.01, 0.02, { confidence_mean: 0.48 })
    const out = mergeFtwSeamTouchingFragments([left, right], 14)
    expect(out.length).toBeLessThanOrEqual(1)
  })
})
