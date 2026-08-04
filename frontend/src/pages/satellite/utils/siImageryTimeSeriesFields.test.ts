import { describe, expect, it } from 'vitest'
import {
  buildSiImageryFieldOptions,
  buildSiImageryFieldOptionsForSource,
  listSiImageryPlotLabelAttributes,
  listSiImageryPlotSourceLayers,
  resolveSiImageryField,
  SI_IMAGERY_COMMITTED_AOI_KEY,
  SI_IMAGERY_DRAWN_AOI_LABEL,
  SI_IMAGERY_PLOT_SOURCE_AGRO,
  SI_IMAGERY_PLOT_SOURCE_DRAWN,
  SI_IMAGERY_VECTOR_LAYER_KEY_PREFIX,
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
      properties: {
        Structure_Type: 1006,
        Farm_Name: 'A4',
        Farm_Code: 'MH147',
        OBJECTID: 1,
      },
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

const potatoPlotsLayer = {
  id: 'potato-plots-upload',
  name: 'Potato_Plots',
  geojson: {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { name: 'Plot A' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [55.1, 24.1],
              [55.11, 24.1],
              [55.11, 24.11],
              [55.1, 24.11],
              [55.1, 24.1],
            ],
          ],
        },
      },
      {
        type: 'Feature',
        properties: { name: 'Plot B' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [55.12, 24.1],
              [55.13, 24.1],
              [55.13, 24.11],
              [55.12, 24.11],
              [55.12, 24.1],
            ],
          ],
        },
      },
    ],
  },
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

  it('includes Layers-panel vector uploads like Potato_Plots in AOI Layers options', () => {
    const options = buildSiImageryFieldOptions(null, [], null, [potatoPlotsLayer])
    expect(options.length).toBe(2)
    expect(options.every(o => o.fieldKey.startsWith(SI_IMAGERY_VECTOR_LAYER_KEY_PREFIX))).toBe(true)
    expect(options.some(o => o.displayName.includes('Plot A'))).toBe(true)
    expect(options.some(o => o.displayName.includes('Plot B'))).toBe(true)

    const key = options.find(o => o.displayName.includes('Plot A'))!.fieldKey
    const resolved = resolveSiImageryField(null, [], null, key, [potatoPlotsLayer])
    expect(resolved?.farmName).toBe('Plot A')
    expect(resolved?.geometry?.type).toBe('Polygon')
  })

  it('merges custom vector layers alongside Agro Structures fields', () => {
    const options = buildSiImageryFieldOptions(agroMask, [], null, [potatoPlotsLayer])
    expect(options.some(o => o.displayName.includes('Plot B'))).toBe(true)
  })

  it('labels plots from a chosen layer attribute (Name / OBJECTID)', () => {
    const withIds = {
      ...potatoPlotsLayer,
      geojson: {
        type: 'FeatureCollection' as const,
        features: [
          {
            type: 'Feature' as const,
            properties: { name: 'Plot A', OBJECTID: 101 },
            geometry: potatoPlotsLayer.geojson.features[0]!.geometry,
          },
          {
            type: 'Feature' as const,
            properties: { name: 'Plot B', OBJECTID: 102 },
            geometry: potatoPlotsLayer.geojson.features[1]!.geometry,
          },
        ],
      },
    }
    const byObjectId = buildSiImageryFieldOptions(null, [], null, [withIds], 'OBJECTID')
    expect(byObjectId.some(o => o.displayName.includes('101'))).toBe(true)
    expect(byObjectId.some(o => o.displayName.includes('102'))).toBe(true)

    const key = byObjectId.find(o => o.displayName.includes('101'))!.fieldKey
    const resolved = resolveSiImageryField(null, [], null, key, [withIds], 'OBJECTID')
    expect(resolved?.farmName).toBe('101')

    const attrs = listSiImageryPlotLabelAttributes([withIds])
    expect(attrs.some(a => a.name === 'OBJECTID' || a.name === 'name')).toBe(true)
  })

  it('recovers Agro Structures fields from paint/viewport layer when mask is empty (Layers AOI)', () => {
    const agroLayer = {
      id: 'agro-structures-fs21',
      name: 'Agro_Structures',
      sourceUrl:
        'https://services1.arcgis.com/jz3ndhbYV5K9NwI8/arcgis/rest/services/Agro_Structures/FeatureServer/21',
      geojson: {
        type: 'FeatureCollection' as const,
        features: [
          {
            type: 'Feature' as const,
            properties: {
              Structure_Type: 1006,
              Farm_Name: 'T-100',
              Farm_Code: 'SC0175',
              OBJECTID: 175,
            },
            geometry: {
              type: 'Polygon' as const,
              coordinates: [
                [
                  [54.2, 24.2],
                  [54.21, 24.2],
                  [54.21, 24.21],
                  [54.2, 24.21],
                  [54.2, 24.2],
                ],
              ],
            },
          },
        ],
      },
    }
    const options = buildSiImageryFieldOptions(null, [], null, [agroLayer])
    expect(options.length).toBeGreaterThan(0)
    expect(options.some(o => /T-100/i.test(o.displayName) || /SC0175/i.test(o.displayName))).toBe(
      true,
    )
    const key = options[0]!.fieldKey
    const resolved = resolveSiImageryField(null, [], null, key, [agroLayer])
    expect(resolved?.geometry?.type).toBe('Polygon')
    expect(resolved?.farmName || resolved?.farmCode).toBeTruthy()
  })

  it('does not duplicate Drawn AOI when already present', () => {
    const options = buildSiImageryFieldOptions(null, [], drawnAoi)
    const again = buildSiImageryFieldOptions(null, [], drawnAoi)
    expect(again.filter(o => o.fieldKey === SI_IMAGERY_COMMITTED_AOI_KEY)).toHaveLength(1)
    expect(options).toEqual(again)
  })

  describe('plot source layers', () => {
    it('lists Potato_Plots and Drawn AOI when both are present', () => {
      const sources = listSiImageryPlotSourceLayers(null, [], drawnAoi, [potatoPlotsLayer])
      expect(sources.map(s => s.id)).toEqual([
        potatoPlotsLayer.id,
        SI_IMAGERY_PLOT_SOURCE_DRAWN,
      ])
      expect(sources.find(s => s.id === potatoPlotsLayer.id)).toMatchObject({
        label: 'Potato_Plots',
        featureCount: 2,
      })
      expect(sources.find(s => s.id === SI_IMAGERY_PLOT_SOURCE_DRAWN)).toMatchObject({
        label: SI_IMAGERY_DRAWN_AOI_LABEL,
        featureCount: 1,
      })
    })

    it('includes Agro Structures when mask fields exist', () => {
      const sources = listSiImageryPlotSourceLayers(agroMask, [], null, [potatoPlotsLayer])
      expect(sources.map(s => s.id)).toEqual([
        SI_IMAGERY_PLOT_SOURCE_AGRO,
        potatoPlotsLayer.id,
      ])
      expect(sources[0]).toMatchObject({
        id: SI_IMAGERY_PLOT_SOURCE_AGRO,
        label: 'Agro Structures',
        featureCount: 1,
      })
    })

    it('lists Agro_Structures under its Layers-panel name (not a duplicate synthetic agro source)', () => {
      const agroLayer = {
        id: 'agro-structures-fs21',
        name: 'Agro_Structures',
        sourceUrl:
          'https://services1.arcgis.com/jz3ndhbYV5K9NwI8/arcgis/rest/services/Agro_Structures/FeatureServer/21',
        viewportStreaming: true,
        geojson: {
          type: 'FeatureCollection' as const,
          features: [
            {
              type: 'Feature' as const,
              properties: {
                Structure_Type: 1006,
                Farm_Name: 'T-100',
                Farm_Code: 'SC0175',
                OBJECTID: 175,
              },
              geometry: {
                type: 'Polygon' as const,
                coordinates: [
                  [
                    [54.2, 24.2],
                    [54.21, 24.2],
                    [54.21, 24.21],
                    [54.2, 24.21],
                    [54.2, 24.2],
                  ],
                ],
              },
            },
          ],
        },
      }
      const sources = listSiImageryPlotSourceLayers(null, [], drawnAoi, [agroLayer, potatoPlotsLayer])
      expect(sources.map(s => s.id)).toEqual([
        agroLayer.id,
        potatoPlotsLayer.id,
        SI_IMAGERY_PLOT_SOURCE_DRAWN,
      ])
      expect(sources.find(s => s.id === agroLayer.id)).toMatchObject({
        label: 'Agro_Structures',
        featureCount: 1,
      })
      expect(sources.some(s => s.id === SI_IMAGERY_PLOT_SOURCE_AGRO)).toBe(false)

      const fields = buildSiImageryFieldOptionsForSource(
        agroLayer.id,
        null,
        [],
        drawnAoi,
        [agroLayer, potatoPlotsLayer],
      )
      expect(fields.length).toBeGreaterThan(0)
      expect(fields.some(o => /T-100/i.test(o.displayName) || /SC0175/i.test(o.displayName))).toBe(
        true,
      )
    })

    it('lists viewport-streaming Agro_Structures even before polygons load', () => {
      const agroStreamingEmpty = {
        id: 'agro-structures-fs21',
        name: 'Agro_Structures',
        viewportStreaming: true,
        geojson: { type: 'FeatureCollection' as const, features: [] },
      }
      const sources = listSiImageryPlotSourceLayers(null, [], null, [agroStreamingEmpty])
      expect(sources).toEqual([
        {
          id: 'agro-structures-fs21',
          label: 'Agro_Structures',
          featureCount: 0,
        },
      ])
    })

    it('includes viewport-streaming vector layers with zero features yet', () => {
      const streamingEmpty = {
        id: 'streaming-plots',
        name: 'Streaming_Plots',
        viewportStreaming: true,
        geojson: { type: 'FeatureCollection' as const, features: [] },
      }
      const sources = listSiImageryPlotSourceLayers(null, [], null, [streamingEmpty])
      expect(sources).toEqual([
        {
          id: 'streaming-plots',
          label: 'Streaming_Plots',
          featureCount: 0,
        },
      ])
    })

    it('filters field options to the selected Potato_Plots layer only', () => {
      const otherLayer = {
        id: 'other-plots',
        name: 'Other_Plots',
        geojson: {
          type: 'FeatureCollection' as const,
          features: [
            {
              type: 'Feature' as const,
              properties: { name: 'Other Plot' },
              geometry: potatoPlotsLayer.geojson.features[0]!.geometry,
            },
          ],
        },
      }
      const fields = buildSiImageryFieldOptionsForSource(
        potatoPlotsLayer.id,
        agroMask,
        [],
        drawnAoi,
        [potatoPlotsLayer, otherLayer],
      )
      expect(fields.length).toBe(2)
      expect(fields.every(o => o.fieldKey.startsWith(`${SI_IMAGERY_VECTOR_LAYER_KEY_PREFIX}${potatoPlotsLayer.id}:`))).toBe(
        true,
      )
      expect(fields.some(o => o.displayName.includes('Plot A'))).toBe(true)
      expect(fields.some(o => o.displayName.includes('Plot B'))).toBe(true)
      expect(fields.some(o => o.displayName.includes('Other Plot'))).toBe(false)
      expect(fields.some(o => o.fieldKey === SI_IMAGERY_COMMITTED_AOI_KEY)).toBe(false)
    })

    it('returns only Agro Structures fields for the agro source', () => {
      const fields = buildSiImageryFieldOptionsForSource(
        SI_IMAGERY_PLOT_SOURCE_AGRO,
        agroMask,
        [],
        drawnAoi,
        [potatoPlotsLayer],
      )
      expect(fields.length).toBeGreaterThan(0)
      expect(fields.every(o => !o.fieldKey.startsWith(SI_IMAGERY_VECTOR_LAYER_KEY_PREFIX))).toBe(true)
      expect(fields.some(o => o.fieldKey === SI_IMAGERY_COMMITTED_AOI_KEY)).toBe(false)
      expect(fields.some(o => /A4/i.test(o.displayName))).toBe(true)
    })

    it('returns only Drawn AOI for the drawn source', () => {
      const fields = buildSiImageryFieldOptionsForSource(
        SI_IMAGERY_PLOT_SOURCE_DRAWN,
        agroMask,
        [],
        drawnAoi,
        [potatoPlotsLayer],
      )
      expect(fields).toEqual([
        {
          fieldKey: SI_IMAGERY_COMMITTED_AOI_KEY,
          displayName: SI_IMAGERY_DRAWN_AOI_LABEL,
          objectId: 'aoi',
        },
      ])
    })

    it('returns no drawn fields when committed AOI is absent', () => {
      expect(
        buildSiImageryFieldOptionsForSource(
          SI_IMAGERY_PLOT_SOURCE_DRAWN,
          agroMask,
          [],
          null,
          [potatoPlotsLayer],
        ),
      ).toEqual([])
    })
  })
})
