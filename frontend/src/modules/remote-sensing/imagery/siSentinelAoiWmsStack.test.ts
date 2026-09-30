import { describe, expect, it } from 'vitest'
import {
  isSiSentinelAoiWmsMapLayerId,
  isSiSentinelAoiWmsMapSourceId,
  siSentinelAoiWmsLayerId,
  siSentinelAoiWmsSourceId,
  SI_SENTINEL_DRAW_WMS_ID_PREFIX,
  SI_SENTINEL_LAYER_AOI_WMS_ID_PREFIX,
} from './siSentinelAoiWmsStack'

describe('siSentinelAoiWmsStack ids', () => {
  it('builds independent source and layer ids per stack', () => {
    expect(siSentinelAoiWmsSourceId(SI_SENTINEL_DRAW_WMS_ID_PREFIX, 0)).toBe('sentinel-draw-source-0')
    expect(siSentinelAoiWmsLayerId(SI_SENTINEL_LAYER_AOI_WMS_ID_PREFIX, 2)).toBe(
      'sentinel-layer-aoi-layer-2',
    )
  })

  it('detects sentinel raster map layers and sources', () => {
    expect(isSiSentinelAoiWmsMapLayerId('sentinel-draw-layer-1')).toBe(true)
    expect(isSiSentinelAoiWmsMapLayerId('sentinel-layer-aoi-layer-0')).toBe(true)
    expect(isSiSentinelAoiWmsMapLayerId('custom-fill')).toBe(false)
    expect(isSiSentinelAoiWmsMapSourceId('sentinel-draw-source-0')).toBe(true)
    expect(isSiSentinelAoiWmsMapSourceId('basemap')).toBe(false)
  })
})
