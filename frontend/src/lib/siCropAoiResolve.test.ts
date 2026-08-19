import { describe, expect, it } from 'vitest'
import { resolveCropAoiGeometry } from './siCropAoiResolve'

describe('resolveCropAoiGeometry', () => {
  it('returns drawn sketch geometry in draw mode', () => {
    const polygon = {
      type: 'Feature',
      geometry: {
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
      },
    }
    const geom = resolveCropAoiGeometry({
      mode: 'draw',
      layerId: '',
      getViewportBounds: () => null,
      customLayers: [],
      gisSelectionHits: [],
      drawnGeometry: polygon,
    })
    expect(geom?.type).toBe('Polygon')
  })

  it('builds viewport FeatureCollection', () => {
    const fc = resolveCropAoiGeometry({
      mode: 'viewport',
      layerId: '',
      getViewportBounds: () => [10, 20, 30, 40],
      customLayers: [],
      gisSelectionHits: [],
      drawnGeometry: null,
    })
    expect(fc?.type).toBe('FeatureCollection')
    if (fc?.type !== 'FeatureCollection') return
    expect(fc.features).toHaveLength(1)
    expect(fc.features[0]?.geometry.type).toBe('Polygon')
  })

  it('returns null for layers mode without layer id', () => {
    expect(
      resolveCropAoiGeometry({
        mode: 'layers',
        layerId: '',
        getViewportBounds: () => null,
        customLayers: [{ id: 'x', geojson: { features: [] } }],
        gisSelectionHits: [],
        drawnGeometry: null,
      }),
    ).toBeNull()
  })
})
