import { describe, expect, it } from 'vitest'
import {
  AGRO_STRUCTURES_FS21_URL,
  agroStructuresHitPropertiesMatch,
  agroStructuresSentinelMaskSqlWhere,
  buildAgroStructuresBboxQueryUrl,
  buildAgroStructuresLayerKpiTotals,
  buildAgroStructuresStructureTypeTotals,
  buildAgroStructuresCountryDescriptionMap,
  featureToPrimaryAoiFeature,
  findAgroStructuresFeatureAtLngLat,
  findAgroStructuresFeatureInLayer,
  isAgroStructuresLayer,
  isAgroStructuresLayerUrl,
  normalizeArcgisLayerUrl,
  resolveAgroStructuresCountryCode,
  resolveAgroStructuresCountryDisplayName,
  resolveAgroStructuresCountryLabel,
  resolveAgroStructuresFieldDisplayName,
} from './agroStructuresPrimaryAoi'

describe('agroStructuresPrimaryAoi', () => {
  it('recognizes Agro_Structures FeatureServer/21 URL', () => {
    expect(isAgroStructuresLayerUrl(AGRO_STRUCTURES_FS21_URL)).toBe(true)
    expect(
      isAgroStructuresLayerUrl(
        'https://services1.arcgis.com/jz3ndhbYV5K9NwI8/ArcGIS/rest/services/Agro_Structures/FeatureServer/21/',
      ),
    ).toBe(true)
    expect(normalizeArcgisLayerUrl('arcgis:' + AGRO_STRUCTURES_FS21_URL)).toBe(
      normalizeArcgisLayerUrl(AGRO_STRUCTURES_FS21_URL),
    )
  })

  it('converts polygon features to primary AOI', () => {
    const aoi = featureToPrimaryAoiFeature({
      type: 'Feature',
      properties: { Farm_Name: 'North Field', OBJECTID: 12 },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [55.1, 25.1],
            [55.2, 25.1],
            [55.2, 25.2],
            [55.1, 25.2],
            [55.1, 25.1],
          ],
        ],
      },
    })
    expect(aoi?.geometry.type).toBe('Polygon')
    expect(aoi?.properties?.aoiSource).toBe('agro-structures')
    expect(aoi?.properties?.label).toBe('North Field')
  })

  it('builds display names from code + structure when Farm_Name is empty', () => {
    expect(
      resolveAgroStructuresFieldDisplayName({
        Farm_Code: 'MH-101',
        Structure_Type: 1006,
        OBJECTID: 1000,
      }),
    ).toBe('MH-101')
    expect(
      resolveAgroStructuresFieldDisplayName({
        Farm_Name: 'Block A',
        Farm_Code: 'MH-101',
        OBJECTID: 1000,
      }),
    ).toBe('Block A (MH-101)')
    expect(
      resolveAgroStructuresFieldDisplayName({
        Structure_Name: 'Pivot East',
        Site_Plot_ID: 'P-12',
        OBJECTID: 42,
      }),
    ).toBe('Pivot East (P-12)')
    expect(
      resolveAgroStructuresFieldDisplayName({
        Structure_Type: 1007,
        OBJECTID: 1000,
      }),
    ).toBe('Farm Plots #1000')
  })

  it('finds layer feature by identify properties', () => {
    const layer = {
      id: 'agro-structures-fs21',
      name: 'Agro_Structures',
      source: 'arcgis',
      sourceUrl: AGRO_STRUCTURES_FS21_URL,
      geojson: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { OBJECTID: 7, Farm_Name: 'A' },
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
        ],
      },
    }
    expect(isAgroStructuresLayer(layer)).toBe(true)
    const hit = findAgroStructuresFeatureInLayer(layer, { OBJECTID: '7', Farm_Name: 'A' })
    expect(hit?.feature.geometry.type).toBe('Polygon')
    expect(hit?.featureKey).toBeTruthy()
  })

  it('matches OBJECTID with string coercion', () => {
    expect(agroStructuresHitPropertiesMatch({ OBJECTID: '12' }, { OBJECTID: 12 })).toBe(true)
  })

  it('resolveAgroStructuresCountryCode reads coded Country field only', () => {
    expect(resolveAgroStructuresCountryCode({ Country: 1, Country_Name: 'UAE' })).toBe('1')
    expect(resolveAgroStructuresCountryDisplayName({ Country: 1, Country_Name: 'UAE' })).toBe('UAE')
  })

  it('builds country coded descriptions from layer schema', () => {
    const map = buildAgroStructuresCountryDescriptionMap({
      fields: [
        {
          name: 'Country',
          domain: {
            type: 'codedValue',
            codedValues: [
              { code: 1, name: 'United Arab Emirates' },
              { code: 2, description: 'Saudi Arabia' },
            ],
          },
        },
      ],
    })
    expect(map.get('1')).toBe('United Arab Emirates')
    expect(map.get('2')).toBe('Saudi Arabia')
    expect(resolveAgroStructuresCountryLabel('1', map)).toBe('United Arab Emirates')
    expect(resolveAgroStructuresCountryLabel('99', map)).toBe('99')
  })

  it('finds feature at lng/lat via point-in-polygon', () => {
    const layer = {
      geojson: {
        features: [
          {
            type: 'Feature',
            properties: { OBJECTID: 1, Farm_Name: 'Farm' },
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [55.1, 25.1],
                  [55.2, 25.1],
                  [55.2, 25.2],
                  [55.1, 25.2],
                  [55.1, 25.1],
                ],
              ],
            },
          },
        ],
      },
    }
    const hit = findAgroStructuresFeatureAtLngLat(layer, 55.15, 25.15)
    expect(hit?.feature.properties?.Farm_Name).toBe('Farm')
  })

  it('builds bbox query URL with Structure_Type filter and envelope geometry', () => {
    const url = buildAgroStructuresBboxQueryUrl([55.1, 25.1, 55.3, 25.3])
    expect(url).toContain('/query?')
    expect(url).toContain(encodeURIComponent(agroStructuresSentinelMaskSqlWhere()))
    expect(url).toContain('geometryType=esriGeometryEnvelope')
    expect(url).toContain('spatialRel=esriSpatialRelIntersects')
    expect(url).toContain(AGRO_STRUCTURES_FS21_URL)
  })

  it('totals polygon counts per Structure_Type from full GeoJSON', () => {
    const ring = [
      [55.1, 25.1],
      [55.11, 25.1],
      [55.11, 25.11],
      [55.1, 25.11],
      [55.1, 25.1],
    ]
    const totals = buildAgroStructuresStructureTypeTotals({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { OBJECTID: 1, Structure_Type: 1000, Area_ha: 2.5 },
          geometry: { type: 'Polygon', coordinates: [ring] },
        },
        {
          type: 'Feature',
          properties: { OBJECTID: 2, Structure_Type: 1006, Area_ha: 10 },
          geometry: { type: 'Polygon', coordinates: [ring] },
        },
        {
          type: 'Feature',
          properties: { OBJECTID: 3, Structure_Type: 1006, Area_ha: 5 },
          geometry: { type: 'Polygon', coordinates: [ring] },
        },
        {
          type: 'Feature',
          properties: { OBJECTID: 4, Structure_Type: 1007 },
          geometry: { type: 'Point', coordinates: [55.1, 25.1] },
        },
      ],
    })
    expect(totals.find(t => t.code === 1000)).toMatchObject({ label: 'Greenhouse', count: 1, areaHa: 2.5 })
    expect(totals.find(t => t.code === 1006)).toMatchObject({ label: 'PIVOT', count: 2, areaHa: 15 })
    expect(totals.find(t => t.code === 1007)?.count).toBe(0)
  })

  it('builds layer-wide KPI totals across all Structure_Type values', () => {
    const ring = [
      [55.1, 25.1],
      [55.11, 25.1],
      [55.11, 25.11],
      [55.1, 25.11],
      [55.1, 25.1],
    ]
    const totals = buildAgroStructuresLayerKpiTotals({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { OBJECTID: 1, Structure_Type: 1000, Area_ha: 2.5 },
          geometry: { type: 'Polygon', coordinates: [ring] },
        },
        {
          type: 'Feature',
          properties: { OBJECTID: 2, Structure_Type: 1006, Area_ha: 10 },
          geometry: { type: 'Polygon', coordinates: [ring] },
        },
        {
          type: 'Feature',
          properties: { OBJECTID: 3, Structure_Type: 1007, Area_ha: 5 },
          geometry: { type: 'Polygon', coordinates: [ring] },
        },
      ],
    })
    expect(totals.totalCount).toBe(3)
    expect(totals.totalAreaHa).toBe(17.5)
    expect(totals.countryCount).toBe(0)
    expect(totals.byType.find(t => t.code === 1000)?.count).toBe(1)
    expect(totals.byType.find(t => t.code === 1006)?.count).toBe(1)
    expect(totals.byType.find(t => t.code === 1007)?.count).toBe(1)
  })

  it('counts distinct countries from Agro_Structures features', () => {
    const ring = [
      [55.1, 25.1],
      [55.11, 25.1],
      [55.11, 25.11],
      [55.1, 25.11],
      [55.1, 25.1],
    ]
    const totals = buildAgroStructuresLayerKpiTotals({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { OBJECTID: 1, Country: 'UAE' },
          geometry: { type: 'Polygon', coordinates: [ring] },
        },
        {
          type: 'Feature',
          properties: { OBJECTID: 2, Country: 'UAE' },
          geometry: { type: 'Polygon', coordinates: [ring] },
        },
        {
          type: 'Feature',
          properties: { OBJECTID: 3, Country: 'Serbia' },
          geometry: { type: 'Polygon', coordinates: [ring] },
        },
      ],
    })
    expect(totals.countryCount).toBe(2)
  })
})
