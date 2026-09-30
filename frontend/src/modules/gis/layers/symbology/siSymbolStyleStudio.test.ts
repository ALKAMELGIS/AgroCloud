import { describe, expect, it } from 'vitest'
import { buildSiCustomVectorStylePack } from './siSymbolStyleStudio'

const uniqueGeojson = {
  type: 'FeatureCollection',
  features: [
    {
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
      properties: { crop: 'Wheat' },
    },
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [2, 0],
            [3, 0],
            [3, 1],
            [2, 1],
            [2, 0],
          ],
        ],
      },
      properties: { crop: 'Corn' },
    },
  ],
}

describe('buildSiCustomVectorStylePack', () => {
  it('uses class override colors in unique-value match expression', () => {
    const pack = buildSiCustomVectorStylePack({
      geojson: uniqueGeojson,
      symbology: {
        useArcGisOnline: false,
        style: 'unique',
        field: 'crop',
        classes: 8,
        method: 'jenks',
        colorRamp: 'viridis',
        classOverrides: { Wheat: { color: '#ff0000' } },
      },
    })
    const fillColor = pack.fillPaint['fill-color']
    expect(JSON.stringify(fillColor)).toContain('#ff0000')
    expect(JSON.stringify(fillColor)).toContain('Wheat')
  })

  it('uses break override colors in graduated step expression', () => {
    const geojson = {
      type: 'FeatureCollection',
      features: [
        {
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
          properties: { area_ha: '1.25' },
        },
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [2, 0],
                [3, 0],
                [3, 1],
                [2, 1],
                [2, 0],
              ],
            ],
          },
          properties: { area_ha: '5.5' },
        },
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [4, 0],
                [5, 0],
                [5, 1],
                [4, 1],
                [4, 0],
              ],
            ],
          },
          properties: { area_ha: '10' },
        },
      ],
    }
    const pack = buildSiCustomVectorStylePack({
      geojson,
      symbology: {
        useArcGisOnline: false,
        style: 'color',
        field: 'area_ha',
        classes: 3,
        method: 'equal',
        colorRamp: 'viridis',
        breakOverrides: [{ min: 0, max: 5, color: '#00ff00' }],
      },
    })
    const fillColor = pack.fillPaint['fill-color']
    expect(JSON.stringify(fillColor)).toContain('#00ff00')
  })
})
