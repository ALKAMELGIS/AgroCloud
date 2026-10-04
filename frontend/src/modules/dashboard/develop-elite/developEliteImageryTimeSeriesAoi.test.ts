import { describe, expect, it } from 'vitest'
import { SI_IMAGERY_COMMITTED_AOI_KEY } from '@/modules/remote-sensing/temporal-analysis/siImageryTimeSeriesFields'
import {
  developEliteCommittedAoiGeometry,
  developEliteDrawnAoiToAoiFields,
  developEliteStructuresToAoiFields,
} from './developEliteImageryTimeSeriesAoi'

describe('developEliteImageryTimeSeriesAoi', () => {
  it('maps structure polygons to AOI field records', () => {
    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'Farm A' },
          geometry: {
            type: 'Polygon',
            coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
          },
        },
      ],
    }
    const fields = developEliteStructuresToAoiFields(geojson)
    expect(fields).toHaveLength(1)
    expect(fields[0]?.name).toBe('Farm A')
  })

  it('builds a single field record from drawn AOI sketch', () => {
    const clip: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [[[2, 2], [3, 2], [3, 3], [2, 3], [2, 2]]],
          },
        },
      ],
    }
    const fields = developEliteDrawnAoiToAoiFields(clip)
    expect(fields).toHaveLength(1)
    expect(fields[0]?.id).toBe(SI_IMAGERY_COMMITTED_AOI_KEY)
  })

  it('reads committed polygon from sketch clip', () => {
    const clip: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [[[2, 2], [3, 2], [3, 3], [2, 3], [2, 2]]],
          },
        },
      ],
    }
    const geom = developEliteCommittedAoiGeometry(clip)
    expect(geom?.type).toBe('Polygon')
  })
})
