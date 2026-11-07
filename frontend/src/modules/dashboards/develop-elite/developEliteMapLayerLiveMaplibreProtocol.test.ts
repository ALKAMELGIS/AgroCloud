import { describe, expect, it } from 'vitest'
import {
  DE_LAYER_LIVE_TILE_URL_TEMPLATE,
  isDevelopEliteLayerLiveTileUrl,
  parseDevelopEliteLayerLiveTileZxy,
  resolveDevelopEliteLayerLiveWmsTileUrl,
} from './developEliteMapLayerLiveMaplibreProtocol'

describe('developEliteMapLayerLiveMaplibreProtocol', () => {
  it('parses https tile template URLs', () => {
    const url = DE_LAYER_LIVE_TILE_URL_TEMPLATE.replace('{z}', '12').replace('{x}', '2048').replace('{y}', '1536')
    expect(isDevelopEliteLayerLiveTileUrl(url)).toBe(true)
    expect(parseDevelopEliteLayerLiveTileZxy(url)).toEqual({ z: 12, x: 2048, y: 1536 })
  })

  it('parses legacy de-layer-live-tile scheme', () => {
    expect(parseDevelopEliteLayerLiveTileZxy('de-layer-live-tile://10/512/384')).toEqual({
      z: 10,
      x: 512,
      y: 384,
    })
  })

  it('resolves WMS bbox when template is mounted', () => {
    ;(globalThis as { __deLayerLiveWmsTemplate?: string }).__deLayerLiveWmsTemplate =
      'https://wms.example/wms?bbox={bbox-epsg-3857}'
    const url = 'https://develop-elite.layer-live.local/tiles/8/120/85'
    const resolved = resolveDevelopEliteLayerLiveWmsTileUrl(url)
    expect(resolved).toContain('https://wms.example/wms?bbox=')
    ;(globalThis as { __deLayerLiveWmsTemplate?: string }).__deLayerLiveWmsTemplate = undefined
  })
})
