import { describe, expect, it } from 'vitest'
import {
  normalizeArcGisFeatureServiceUrl,
  resolveArcGisFeatureServiceNameFromUrl,
  resolveArcGisLayerTitleFromUrl,
  resolveHostedFeatureLayerPortalTitle,
} from './arcgisFeatureServiceUrl'

describe('arcgisFeatureServiceUrl', () => {
  const agroUrl =
    'https://services1.arcgis.com/jz3ndhbYV5K9NwI8/ArcGIS/rest/services/Agro_Structures/FeatureServer/21'

  it('normalizes layer id suffix from FeatureServer URLs', () => {
    expect(normalizeArcGisFeatureServiceUrl(agroUrl)).toBe(
      'https://services1.arcgis.com/jz3ndhbYV5K9NwI8/ArcGIS/rest/services/Agro_Structures/FeatureServer',
    )
  })

  it('extracts Agro_Structures service name from URL', () => {
    expect(resolveArcGisFeatureServiceNameFromUrl(agroUrl)).toBe('Agro_Structures')
  })

  it('uses service name instead of layer id 21 for portal title', () => {
    expect(resolveArcGisLayerTitleFromUrl(agroUrl)).toBe('Agro_Structures')
    expect(resolveArcGisLayerTitleFromUrl(agroUrl, '21')).toBe('Agro_Structures')
  })

  it('keeps explicit non-numeric preferred names', () => {
    expect(resolveArcGisLayerTitleFromUrl(agroUrl, 'Field boundaries')).toBe('Field boundaries')
  })

  it('resolves hosted portal title for arcgis-url imports', () => {
    expect(
      resolveHostedFeatureLayerPortalTitle({
        title: '21',
        url: agroUrl,
        sourceMethod: 'arcgis-url',
      }),
    ).toBe('Agro_Structures')
  })
})
