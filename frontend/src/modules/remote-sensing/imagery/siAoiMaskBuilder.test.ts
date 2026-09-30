import { describe, expect, it } from 'vitest'
import {
  buildSiAoiMaskBuilderGeoJson,
  featureMatchesAoiMaskFilterValues,
  listSiAoiMaskBuilderFieldOptions,
  listSiAoiLayerModeOptions,
  listSiAoiMaskBuilderUniqueFieldValues,
  normalizeSiAoiMaskBuilderSettings,
  resolveSiAoiMaskBuilderClipGeoJson,
} from './siAoiMaskBuilder'

const layer = {
  id: 'test-layer',
  geojson: {
    features: [
      {
        type: 'Feature',
        properties: { OBJECTID: 1, Structure_Type: 1007 },
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
      },
      {
        type: 'Feature',
        properties: { OBJECTID: 2, Structure_Type: 1006 },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [2, 2],
              [3, 2],
              [3, 3],
              [2, 3],
              [2, 2],
            ],
          ],
        },
      },
      {
        type: 'Feature',
        properties: { OBJECTID: 3, Structure_Type: 1000 },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [4, 4],
              [5, 4],
              [5, 5],
              [4, 5],
              [4, 4],
            ],
          ],
        },
      },
    ],
  },
}

describe('siAoiMaskBuilder', () => {
  it('lists fields from ArcGIS layer definition when feature properties are missing', () => {
    const schemaLayer = {
      id: 'agro-structures-fs21',
      geojson: {
        features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [] } }],
      },
      arcgisLayerDefinition: {
        typeIdField: 'Structure_Type',
        fields: [{ name: 'Farm_Name' }, { name: 'Structure_Type', alias: 'Structure Type' }],
        types: [
          { id: 1006, name: 'PIVOT' },
          { id: 1007, name: 'Farm Plots' },
        ],
      },
    }
    expect(listSiAoiMaskBuilderFieldOptions(schemaLayer)).toEqual(['Farm_Name', 'Structure_Type'])
    const values = listSiAoiMaskBuilderUniqueFieldValues(schemaLayer, 'Structure_Type')
    expect(values).toContain('PIVOT (1006)')
    expect(values).toContain('Farm Plots (1007)')
  })

  it('lists unique field values with labels', () => {
    const values = listSiAoiMaskBuilderUniqueFieldValues(layer, 'Structure_Type')
    expect(values.some(v => v.includes('Farm Plots'))).toBe(true)
    expect(values.some(v => v.includes('PIVOT'))).toBe(true)
  })

  it('filters features by field values', () => {
    expect(
      featureMatchesAoiMaskFilterValues({ Structure_Type: 1007 }, 'Structure_Type', ['Farm Plots (1007)']),
    ).toBe(true)
    expect(
      featureMatchesAoiMaskFilterValues({ Structure_Type: 1000 }, 'Structure_Type', ['1006', '1007']),
    ).toBe(false)
  })

  it('builds mask geojson from filtered features', () => {
    const mask = buildSiAoiMaskBuilderGeoJson(
      layer,
      {
        filterField: 'Structure_Type',
        filterValues: ['1006', '1007'],
        maskMode: 'filtered-features',
      },
      new Set(),
    )
    expect(mask?.features).toHaveLength(2)
  })

  it('resolveSiAoiMaskBuilderClipGeoJson falls back to Agro_Structures default mask', () => {
    const agroLayer = {
      id: 'agro-structures-fs21',
      sourceUrl: 'https://services1.arcgis.com/jz3ndhbYV5K9NwI8/arcgis/rest/services/Agro_Structures/FeatureServer/21',
      geojson: layer.geojson,
    }
    const mask = resolveSiAoiMaskBuilderClipGeoJson(
      agroLayer,
      {
        enabled: true,
        sourceLayerId: 'agro-structures-fs21',
        filterField: 'Structure_Type',
        filterValues: [],
        sentinelLayerId: '',
        maskMode: 'filtered-features',
        displayMode: 'transparent-outside',
        liveUpdate: true,
      },
      new Set(),
    )
    expect(mask?.features?.length).toBe(2)
  })

  it('lists Agro_Structures fallback fields when properties are empty', () => {
    const agroLayer = {
      id: 'agro-structures-fs21',
      sourceUrl: 'https://services1.arcgis.com/jz3ndhbYV5K9NwI8/arcgis/rest/services/Agro_Structures/FeatureServer/21',
      geojson: { features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [] } }] },
    }
    expect(listSiAoiMaskBuilderFieldOptions(agroLayer)).toContain('Structure_Type')
  })

  it('includes viewport-streaming layers in AOI layer mode options before tiles load', () => {
    const opts = listSiAoiLayerModeOptions([
      { id: 'vec-1', name: 'Fields', geojson: { features: [{ type: 'Feature' }] } },
      { id: 'stream-1', name: 'Live FS', geojson: { features: [] }, viewportStreaming: true },
      { id: 'raster-1', name: 'Ortho', renderMode: 'raster', geojson: { features: [] } },
    ])
    expect(opts.map(o => o.id)).toEqual(['vec-1', 'stream-1'])
  })

  it('normalizeSiAoiMaskBuilderSettings coerces filtered-features to entire-layer', () => {
    const normalized = normalizeSiAoiMaskBuilderSettings({
      enabled: true,
      sourceLayerId: 'aoi-layer',
      maskMode: 'filtered-features',
      filterField: 'Structure_Type',
      filterValues: ['1006', '1007'],
    })
    expect(normalized.maskMode).toBe('entire-layer')
    expect(normalizeSiAoiMaskBuilderSettings({ maskMode: 'selected-features' }).maskMode).toBe(
      'selected-features',
    )
    expect(normalizeSiAoiMaskBuilderSettings({}).maskMode).toBe('entire-layer')
  })

  it('builds entire-layer mask for a non-Agro AOI FeatureCollection', () => {
    const aoiLayer = {
      id: 'custom-aoi',
      name: 'AOI',
      geojson: {
        features: [
          {
            type: 'Feature',
            properties: { Plot_ID: 'T-100' },
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [46.6, 24.7],
                  [46.61, 24.7],
                  [46.61, 24.71],
                  [46.6, 24.71],
                  [46.6, 24.7],
                ],
              ],
            },
          },
          {
            type: 'Feature',
            properties: { Plot_ID: 'T-101' },
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [46.62, 24.7],
                  [46.63, 24.7],
                  [46.63, 24.71],
                  [46.62, 24.71],
                  [46.62, 24.7],
                ],
              ],
            },
          },
        ],
      },
    }
    const mask = buildSiAoiMaskBuilderGeoJson(
      aoiLayer,
      { filterField: '', filterValues: [], maskMode: 'entire-layer' },
      new Set(),
    )
    expect(mask?.features).toHaveLength(2)
    const clip = resolveSiAoiMaskBuilderClipGeoJson(
      aoiLayer,
      {
        enabled: true,
        sourceLayerId: 'custom-aoi',
        filterField: 'Structure_Type',
        filterValues: ['1006', '1007'],
        sentinelLayerId: 'NDVI',
        maskMode: 'entire-layer',
        displayMode: 'transparent-outside',
        liveUpdate: true,
      },
      new Set(),
    )
    expect(clip?.features?.length).toBe(2)
  })
})
