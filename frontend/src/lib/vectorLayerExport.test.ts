import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  asFeatureCollection,
  downloadVectorXlsx,
  exportVectorLayer,
} from './vectorLayerExport'

const sampleFc: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: 'A', ndvi: 0.42 },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [55.0, 25.0],
            [55.01, 25.0],
            [55.01, 25.01],
            [55.0, 25.01],
            [55.0, 25.0],
          ],
        ],
      },
    },
  ],
}

beforeEach(() => {
  vi.stubGlobal(
    'URL',
    Object.assign(function URL() {}, {
      createObjectURL: vi.fn(() => 'blob:mock'),
      revokeObjectURL: vi.fn(),
    }),
  )
})

describe('vectorLayerExport', () => {
  it('normalizes Feature to FeatureCollection', () => {
    const fc = asFeatureCollection(sampleFc.features[0])
    expect(fc.features).toHaveLength(1)
  })

  it('exports XLSX without throwing', () => {
    expect(() => downloadVectorXlsx(sampleFc, 'test-export.xlsx')).not.toThrow()
  })

  it('exports KMZ and SHP for polygons', async () => {
    await expect(exportVectorLayer(sampleFc, 'kmz', 'test-poly')).resolves.toBeUndefined()
    await expect(exportVectorLayer(sampleFc, 'shp', 'test-poly')).resolves.toBeUndefined()
  })
})
