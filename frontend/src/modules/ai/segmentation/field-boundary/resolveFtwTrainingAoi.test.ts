import { describe, expect, it } from 'vitest'
import { isUsableSiActiveAoi, pickFtwTrainingAoi } from './resolveFtwTrainingAoi'

const fc = {
  type: 'FeatureCollection' as const,
  features: [
    {
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'Polygon' as const,
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0],
          ],
        ],
      },
    },
  ],
}

describe('resolveFtwTrainingAoi', () => {
  it('rejects empty placeholder AOI objects', () => {
    expect(isUsableSiActiveAoi({ geometry: null, key: '', source: null })).toBe(false)
    expect(isUsableSiActiveAoi({ geometry: fc, key: '', source: 'layers' })).toBe(false)
  })

  it('falls back to satellite active AOI when field-boundary AOI is empty', () => {
    const picked = pickFtwTrainingAoi(
      { geometry: null, key: '', source: null },
      { geometry: fc, key: 'layers:abc', source: 'layers' },
    )
    expect(picked.key).toBe('layers:abc')
    expect(picked.source).toBe('layers')
  })
})
