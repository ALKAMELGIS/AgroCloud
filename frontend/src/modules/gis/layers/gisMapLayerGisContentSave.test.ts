import { describe, expect, it, beforeEach } from 'vitest'
import { resetGisContentPortalForTests, getGisContentPortalRows } from './gisContentPortalStore'
import { geoJsonForGisContentLayerSave, saveMapVectorLayerToGisContent } from './gisMapLayerGisContentSave'

describe('gisMapLayerGisContentSave', () => {
  beforeEach(() => {
    resetGisContentPortalForTests()
  })

  it('validates geojson payloads', () => {
    expect(geoJsonForGisContentLayerSave(null)).toBeNull()
    expect(
      geoJsonForGisContentLayerSave({
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: { id: 1 }, geometry: { type: 'Point', coordinates: [0, 0] } }],
      }),
    ).toBeTruthy()
  })

  it('creates hosted feature layer rows in GIS Content', () => {
    const row = saveMapVectorLayerToGisContent({
      layerName: 'Field plots',
      geojson: {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: { name: 'A' }, geometry: { type: 'Point', coordinates: [46.7, 24.7] } }],
      },
      mode: 'save',
      title: 'Field plots',
    })
    expect(row.type).toBe('feature-layer')
    expect(getGisContentPortalRows().some(r => r.id === row.id)).toBe(true)
  })
})
