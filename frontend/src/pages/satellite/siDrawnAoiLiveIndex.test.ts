import { describe, expect, it } from 'vitest'
import { drawnAoiClipSignature, normalizeDrawnAoiClipCollection } from './siDrawnAoiLiveIndex'

describe('siDrawnAoiLiveIndex', () => {
  it('normalizes a drawn polygon feature for WMS clip', () => {
    const fc = normalizeDrawnAoiClipCollection({
      type: 'Feature',
      properties: { label: 'Drawn circle' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [55, 24],
            [55.1, 24],
            [55.1, 24.1],
            [55, 24.1],
            [55, 24],
          ],
        ],
      },
    })
    expect(fc?.type).toBe('FeatureCollection')
    expect(fc?.features).toHaveLength(1)
    expect(drawnAoiClipSignature(fc)).toContain('drawn:1')
  })
})
