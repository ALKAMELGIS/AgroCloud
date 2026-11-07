import { describe, expect, it } from 'vitest'
import { lngLatBoxToBboxEpsg3857, resolveDevelopEliteLayerLiveAoiImageUrl } from './developEliteMapLayerLiveAoiImage'

describe('developEliteMapLayerLiveAoiImage', () => {
  it('builds EPSG:3857 BBOX from WGS84 bounds', () => {
    const bbox = lngLatBoxToBboxEpsg3857([54, 24, 56, 26])
    expect(bbox).toMatch(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/)
  })

  it('replaces WMS bbox placeholder for AOI image', () => {
    const url = resolveDevelopEliteLayerLiveAoiImageUrl(
      'https://example.com/wms?BBOX={bbox-epsg-3857}&LAYERS=NDVI',
      [54, 24, 56, 26],
    )
    expect(url).not.toContain('{bbox-epsg-3857}')
    expect(url).toContain('LAYERS=NDVI')
  })
})
