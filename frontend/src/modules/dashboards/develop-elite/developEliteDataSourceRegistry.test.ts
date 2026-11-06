import { describe, expect, it } from 'vitest'
import { developEliteArcGisUrlShortLabel, developEliteDataSourcesByGroup } from './developEliteDataSourceRegistry'

describe('developEliteDataSourceRegistry', () => {
  it('parses FeatureServer path into short label', () => {
    expect(
      developEliteArcGisUrlShortLabel(
        'https://services1.arcgis.com/jz3ndhbYV5K9NwI8/ArcGIS/rest/services/Irrigation_Pressure_Main_Pipe/FeatureServer/0',
      ),
    ).toBe('Irrigation_Pressure_Main_Pipe /0')
  })

  it('groups irrigation sources together', () => {
    const keys = developEliteDataSourcesByGroup('irrigation').map(s => s.key)
    expect(keys).toEqual(['irrigationValvesLayerUrl', 'irrigationMainPipeLayerUrl'])
  })
})
