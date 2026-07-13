import { describe, expect, it } from 'vitest'
import { isSiAnalysisRasterMapLayerId } from './siMapAnalysisLayerOrder'

describe('siMapAnalysisLayerOrder', () => {
  it('treats ping-pong sentinel raster layers as analysis rasters', () => {
    expect(isSiAnalysisRasterMapLayerId('sentinel-layer-aoi-layer-0-s0')).toBe(true)
    expect(isSiAnalysisRasterMapLayerId('sentinel-draw-layer-1')).toBe(true)
    expect(isSiAnalysisRasterMapLayerId('agrocloud-basemap-layer-0')).toBe(false)
  })
})
