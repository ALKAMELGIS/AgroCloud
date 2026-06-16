import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AGRO_STRUCTURES_FS21_URL } from './agroStructuresPrimaryAoi'
import {
  getGisContentItemDetails,
  getGisContentPortalRows,
  reloadGisContentPortalFromStorageForTests,
  resetGisContentPortalForTests,
} from './gisContentPortalStore'
import { isAgroStructuresPortalRow, readGisHostedFeatureLayerSnapshot, isWorldCountriesPortalRow } from './gisHostedFeatureLayerPortal'
import {
  AGRO_STRUCTURES_GIS_CONTENT_PORTAL_ID,
  WORLD_COUNTRIES_GIS_CONTENT_PORTAL_ID,
  ensureAgroStructuresGisContentPortalRow,
  ensureDefaultGisContentPortalHostedLayers,
  ensureWorldCountriesGisContentPortalRow,
  persistArcGisHostedFeatureLayerToGisContentPortal,
  publishGisContentNewItem,
} from './gisContentPortalPublish'
import { WORLD_COUNTRIES_FS51_URL } from './worldCountriesLayer'

describe('gisContentPortalPublish', () => {
  beforeEach(() => {
    resetGisContentPortalForTests()
  })

  afterEach(() => {
    resetGisContentPortalForTests()
  })

  it('persists catalog items from the New item grid to GIS Content', async () => {
    const row = await publishGisContentNewItem({ type: 'data-store', title: 'Field warehouse connection' })
    expect(row.title).toBe('Field warehouse connection')
    expect(row.typeLabel).toBe('Data store')
    expect(getGisContentPortalRows().some(r => r.id === row.id)).toBe(true)

    reloadGisContentPortalFromStorageForTests()
    expect(getGisContentPortalRows().some(r => r.id === row.id)).toBe(true)
  })

  it('persists feature layers created from the wizard', async () => {
    const row = await publishGisContentNewItem({
      type: 'feature-layer',
      title: 'Irrigation zones',
      featureLayer: {
        method: 'define-own',
        title: 'Irrigation zones',
        geometryType: 'polygon',
        options: { gpsMetadata: false, zValues: false, mValues: false },
      },
    })
    expect(row.type).toBe('feature-layer')
    expect(getGisContentPortalRows().some(r => r.id === row.id)).toBe(true)
  })

  it('ensures Agro_Structures is saved to Central GIS Repository', () => {
    const geojson = {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          properties: { Farm_Code: 'A1' },
          geometry: {
            type: 'Polygon' as const,
            coordinates: [[[46.7, 24.7], [46.75, 24.7], [46.75, 24.75], [46.7, 24.75], [46.7, 24.7]]],
          },
        },
      ],
    }
    const row = ensureAgroStructuresGisContentPortalRow({ geojson })
    expect(row.id).toBe(AGRO_STRUCTURES_GIS_CONTENT_PORTAL_ID)
    expect(isAgroStructuresPortalRow(row)).toBe(true)
    expect(getGisContentPortalRows().some(r => r.id === row.id)).toBe(true)
    const snap = readGisHostedFeatureLayerSnapshot(getGisContentItemDetails(row.id))
    expect(snap?.externalServiceUrl).toBe(AGRO_STRUCTURES_FS21_URL)

    const again = ensureAgroStructuresGisContentPortalRow()
    expect(again.id).toBe(row.id)
    expect(getGisContentPortalRows().filter(isAgroStructuresPortalRow)).toHaveLength(1)

    reloadGisContentPortalFromStorageForTests()
    expect(getGisContentPortalRows().some(r => r.id === row.id)).toBe(true)
  })

  it('ensures World_Countries is saved to Central GIS Repository', () => {
    const geojson = {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          properties: { COUNTRY: 'Ethiopia' },
          geometry: {
            type: 'Polygon' as const,
            coordinates: [[[38.7, 8.9], [40.7, 8.9], [40.7, 10.9], [38.7, 10.9], [38.7, 8.9]]],
          },
        },
      ],
    }
    const row = ensureWorldCountriesGisContentPortalRow({ geojson })
    expect(row.id).toBe(WORLD_COUNTRIES_GIS_CONTENT_PORTAL_ID)
    expect(isWorldCountriesPortalRow(row)).toBe(true)
    expect(getGisContentPortalRows().some(r => r.id === row.id)).toBe(true)
    const snap = readGisHostedFeatureLayerSnapshot(getGisContentItemDetails(row.id))
    expect(snap?.externalServiceUrl).toBe(WORLD_COUNTRIES_FS51_URL)

    const again = ensureWorldCountriesGisContentPortalRow()
    expect(again.id).toBe(row.id)
    expect(getGisContentPortalRows().filter(isWorldCountriesPortalRow)).toHaveLength(1)
  })

  it('seeds default hosted ArcGIS layers without duplicates', () => {
    const { agroStructures, worldCountries } = ensureDefaultGisContentPortalHostedLayers()
    expect(agroStructures.id).toBe(AGRO_STRUCTURES_GIS_CONTENT_PORTAL_ID)
    expect(worldCountries.id).toBe(WORLD_COUNTRIES_GIS_CONTENT_PORTAL_ID)
    expect(getGisContentPortalRows().filter(isAgroStructuresPortalRow)).toHaveLength(1)
    expect(getGisContentPortalRows().filter(isWorldCountriesPortalRow)).toHaveLength(1)

    ensureDefaultGisContentPortalHostedLayers()
    expect(getGisContentPortalRows().filter(isAgroStructuresPortalRow)).toHaveLength(1)
    expect(getGisContentPortalRows().filter(isWorldCountriesPortalRow)).toHaveLength(1)
  })

  it('persists ArcGIS layers by service URL without duplicates', () => {
    const geojson = {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          properties: { id: 1 },
          geometry: { type: 'Point' as const, coordinates: [55, 25] },
        },
      ],
    }
    const serviceUrl = 'https://example.com/arcgis/rest/services/Fields/FeatureServer/0'
    const first = persistArcGisHostedFeatureLayerToGisContentPortal({
      title: 'Fields',
      geojson,
      serviceUrl,
    })
    const second = persistArcGisHostedFeatureLayerToGisContentPortal({
      title: 'Fields updated',
      geojson,
      serviceUrl,
    })
    expect(second.id).toBe(first.id)
    expect(getGisContentPortalRows().filter(r => r.title.includes('Fields')).length).toBe(1)
  })
})
