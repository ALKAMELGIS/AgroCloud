import { describe, expect, it } from 'vitest'
import {
  buildSiImageryFieldOptions,
  SI_IMAGERY_COMMITTED_AOI_KEY,
  SI_IMAGERY_DRAWN_AOI_LABEL,
} from './siImageryTimeSeriesFields'

const drawnAoi: GeoJSON.Polygon = {
  type: 'Polygon',
  coordinates: [
    [
      [55, 25],
      [55.01, 25],
      [55.01, 25.01],
      [55, 25.01],
      [55, 25],
    ],
  ],
}

const agroMask: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: 'A4', objectId: 1, structureType: 'Field' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [54, 24],
            [54.01, 24],
            [54.01, 24.01],
            [54, 24.01],
            [54, 24],
          ],
        ],
      },
    },
  ],
}

describe('siImageryTimeSeriesFields', () => {
  it('appends Drawn AOI alongside sketch field options', () => {
    const options = buildSiImageryFieldOptions(
      null,
      [
        {
          id: 'sketch-1',
          name: 'A4 (MH147)',
          centroid: [55, 25],
          geometry: drawnAoi,
        },
      ],
      drawnAoi,
    )
    expect(options.length).toBe(2)
    expect(options.some(o => o.fieldKey === 'sketch-1')).toBe(true)
    expect(options.some(o => o.fieldKey === SI_IMAGERY_COMMITTED_AOI_KEY)).toBe(true)
    expect(options.find(o => o.fieldKey === SI_IMAGERY_COMMITTED_AOI_KEY)?.displayName).toBe(
      SI_IMAGERY_DRAWN_AOI_LABEL,
    )
  })

  it('returns only Drawn AOI when no structure fields exist', () => {
    const options = buildSiImageryFieldOptions(null, [], drawnAoi)
    expect(options).toEqual([
      {
        fieldKey: SI_IMAGERY_COMMITTED_AOI_KEY,
        displayName: SI_IMAGERY_DRAWN_AOI_LABEL,
        objectId: 'aoi',
      },
    ])
  })

  it('does not duplicate Drawn AOI when already present', () => {
    const options = buildSiImageryFieldOptions(null, [], drawnAoi)
    const again = buildSiImageryFieldOptions(null, [], drawnAoi)
    expect(again.filter(o => o.fieldKey === SI_IMAGERY_COMMITTED_AOI_KEY)).toHaveLength(1)
    expect(options).toEqual(again)
  })
})
