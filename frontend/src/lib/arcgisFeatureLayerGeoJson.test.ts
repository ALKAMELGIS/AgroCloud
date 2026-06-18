import { describe, expect, it } from 'vitest'
import { resolveArcGisFeatureLayerQueryProfile } from './arcgisFeatureLayerGeoJson'
import { WORLD_COUNTRIES_FS51_URL } from './worldCountriesLayer'

describe('resolveArcGisFeatureLayerQueryProfile', () => {
  it('uses small pages and strong simplification for World_Countries', () => {
    const profile = resolveArcGisFeatureLayerQueryProfile(WORLD_COUNTRIES_FS51_URL, {
      geometryType: 'esriGeometryPolygon',
      maxRecordCount: 2000,
    })
    expect(profile.pageSize).toBe(100)
    expect(profile.maxAllowableOffset).toBe('0.2')
    expect(profile.outFields).toContain('COUNTRY')
    expect(profile.geometryPrecision).toBe(4)
  })

  it('simplifies large generic polygon layers', () => {
    const profile = resolveArcGisFeatureLayerQueryProfile(
      'https://example.com/arcgis/rest/services/Fields/FeatureServer/0',
      { geometryType: 'esriGeometryPolygon', maxRecordCount: 2000 },
      800,
    )
    expect(profile.pageSize).toBeLessThanOrEqual(500)
    expect(profile.maxAllowableOffset).toBeTruthy()
  })
})
