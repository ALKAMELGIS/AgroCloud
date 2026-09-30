import { describe, expect, it } from 'vitest'
import {
  applyFtwFieldBoundaryMaskExport,
  isFtwTileSeamSliver,
  stripFtwTileSeamSlivers,
} from './ftwTileSeamFilter'

function rect(minX: number, minY: number, w: number, h: number, props?: Record<string, unknown>): GeoJSON.Feature {
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

describe('ftwTileSeamFilter', () => {
  it('flags thin vertical tile seam slivers', () => {
    const seam = rect(0.1, 0.2, 0.00003, 0.04)
    expect(isFtwTileSeamSliver(seam)).toBe(true)
  })

  it('keeps normal field-sized polygons', () => {
    const field = rect(0.1, 0.2, 0.003, 0.004, { field_id: 'f-1', confidence_mean: 0.5 })
    expect(isFtwTileSeamSliver(field)).toBe(false)
  })

  it('stripFtwTileSeamSlivers removes seams but keeps fields', () => {
    const field = rect(0.1, 0.2, 0.003, 0.004, { field_id: 'f-1', confidence_mean: 0.5 })
    const seam = rect(0.13, 0.2, 0.00003, 0.04, { field_id: 'seam-1' })
    const out = stripFtwTileSeamSlivers([field, seam])
    expect(out).toHaveLength(1)
    expect((out[0]!.properties as Record<string, unknown>).field_id).toBe('f-1')
  })

  it('applyFtwFieldBoundaryMaskExport dedupes by id without changing field geometry', () => {
    const a = rect(0.1, 0.2, 0.003, 0.004, { field_id: 'dup', confidence_mean: 0.55 })
    const b = rect(0.1, 0.2, 0.003, 0.004, { field_id: 'dup', confidence_mean: 0.4 })
    const out = applyFtwFieldBoundaryMaskExport([a, b])
    expect(out).toHaveLength(1)
    expect((out[0]!.properties as Record<string, unknown>).confidence_mean).toBe(0.55)
    expect(out[0]!.geometry).toEqual(a.geometry)
  })
})
