import { describe, expect, it } from 'vitest'
import {
  arcGisServiceTypeLabel,
  buildArcGisImageServerRasterTiles,
  buildArcGisMapServerRasterTiles,
  createEmptyArcGisFeatureCollection,
  detectArcGisServiceTypeFromUrl,
  normalizeArcGisLayerEndpointUrl,
  shouldUseArcGisViewportStreaming,
} from './arcgisDynamicLayer'

describe('arcgisDynamicLayer', () => {
  it('detects service types from URL patterns', () => {
    expect(
      detectArcGisServiceTypeFromUrl(
        'https://services.arcgis.com/org/arcgis/rest/services/Layer/FeatureServer/0',
      ),
    ).toBe('feature')
    expect(
      detectArcGisServiceTypeFromUrl('https://sampleserver6.arcgisonline.com/arcgis/rest/services/USA/MapServer'),
    ).toBe('map')
    expect(
      detectArcGisServiceTypeFromUrl('https://tiles.arcgis.com/tiles/org/VectorTileServer'),
    ).toBe('vector-tile')
    expect(
      detectArcGisServiceTypeFromUrl('https://sampleserver6.arcgisonline.com/arcgis/rest/services/CharlotteLAS/ImageServer'),
    ).toBe('image')
  })

  it('normalizes layer endpoint URLs', () => {
    expect(
      normalizeArcGisLayerEndpointUrl(
        'https://services.arcgis.com/org/arcgis/rest/services/Layer/FeatureServer/0/',
      ),
    ).toBe('https://services.arcgis.com/org/arcgis/rest/services/Layer/FeatureServer/0')
    expect(
      normalizeArcGisLayerEndpointUrl(
        'https://services.arcgis.com/org/arcgis/rest/services/Layer/FeatureServer/0?f=json',
      ),
    ).toBe('https://services.arcgis.com/org/arcgis/rest/services/Layer/FeatureServer/0')
  })

  it('builds Mapbox-compatible raster tile templates', () => {
    const mapTiles = buildArcGisMapServerRasterTiles(
      'https://sampleserver6.arcgisonline.com/arcgis/rest/services/USA/MapServer',
    )
    expect(mapTiles.tiles[0]).toContain('{bbox-epsg-3857}')
    expect(mapTiles.tiles[0]).toContain('/export?')

    const imageTiles = buildArcGisImageServerRasterTiles(
      'https://sampleserver6.arcgisonline.com/arcgis/rest/services/CharlotteLAS/ImageServer',
      'tok123',
    )
    expect(imageTiles.tiles[0]).toContain('/exportImage?')
    expect(imageTiles.tiles[0]).toContain('token=tok123')
  })

  it('labels service types for UI', () => {
    expect(arcGisServiceTypeLabel('feature')).toBe('Feature Service')
    expect(arcGisServiceTypeLabel('vector-tile')).toBe('Vector Tile Service')
  })

  it('recommends viewport streaming for heavy polygon layers', () => {
    expect(
      shouldUseArcGisViewportStreaming({
        serviceType: 'feature',
        layerUrl: 'https://x/FeatureServer/0',
        name: 'Fields',
        geometryType: 'esriGeometryPolygon',
        maxRecordCount: 2000,
      }),
    ).toBe(true)
    expect(
      shouldUseArcGisViewportStreaming({
        serviceType: 'feature',
        layerUrl: 'https://x/FeatureServer/0',
        name: 'Sites',
        geometryType: 'esriGeometryPoint',
        maxRecordCount: 5000,
      }),
    ).toBe(false)
  })

  it('creates empty feature collections for lazy layers', () => {
    const fc = createEmptyArcGisFeatureCollection()
    expect(fc.type).toBe('FeatureCollection')
    expect(fc.features).toEqual([])
  })
})
