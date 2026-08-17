import { describe, expect, it } from 'vitest'
import { createSiVectorImportLayer, withSiImportedLayerDefaults } from './siCustomLayerFactory'
import {
  SI_DEFAULT_VECTOR_OUTLINE_COLOR,
  SI_DEFAULT_VECTOR_POLYGON_FILL_ALPHA,
} from '../pages/satellite/siSymbolStyleStudio'

const emptyPoly = {
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

describe('withSiImportedLayerDefaults', () => {
  it('uses black outline and hollow fill for upload layers', () => {
    const layer = withSiImportedLayerDefaults({
      id: 'u1',
      name: 'AOI',
      geojson: emptyPoly,
      source: 'upload',
    })
    expect(layer.color).toBe(SI_DEFAULT_VECTOR_OUTLINE_COLOR)
    expect(layer.fillColor).toBe(SI_DEFAULT_VECTOR_OUTLINE_COLOR)
    expect(layer.polygonFillAlpha).toBe(SI_DEFAULT_VECTOR_POLYGON_FILL_ALPHA)
    expect(layer.polygonFillAlpha).toBe(0)
  })

  it('ignores portalColors that would add fill', () => {
    const layer = withSiImportedLayerDefaults(
      {
        id: 'p1',
        name: 'Portal',
        geojson: emptyPoly,
        source: 'api',
      },
      {
        portalStyle: true,
        portalColors: {
          color: '#38bdf8',
          fillColor: '#38bdf8',
          weight: 2.25,
          polygonFillAlpha: 0.22,
        },
      },
    )
    expect(layer.color).toBe('#000000')
    expect(layer.polygonFillAlpha).toBe(0)
  })
})

describe('createSiVectorImportLayer', () => {
  it('creates upload shapefile layers as outline-only black', () => {
    const layer = createSiVectorImportLayer({
      name: 'AOI',
      geojson: emptyPoly,
      source: 'upload',
      format: 'Shapefile',
      portalStyle: true,
      portalColors: {
        color: '#38bdf8',
        fillColor: '#38bdf8',
        weight: 3,
        polygonFillAlpha: 0.5,
      },
    })
    expect(layer.color).toBe('#000000')
    expect(layer.polygonFillAlpha).toBe(0)
    expect(layer.visible).toBe(true)
  })
})
