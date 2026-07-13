import { describe, expect, it } from 'vitest'
import {
  boundsFromWorldFile,
  detectCrsFromBounds,
  parseWorldFile,
  reprojectBoundsToWebMercator,
  reprojectBoundsToWgs84,
  webMercatorToWgs84Bounds,
  worldFileExtensionForRaster,
  rasterNeedsWorldSidecar,
} from './siAiDlRasterPipeline'

describe('siAiDlRasterPipeline', () => {
  it('parses world files', () => {
    const wf = parseWorldFile(`0.5\n0\n0\n-0.5\n500000\n4000000\n`)
    expect(wf).not.toBeNull()
    if (!wf) return
    const bounds = boundsFromWorldFile(wf, 1000, 1000)
    expect(bounds.east - bounds.west).toBeCloseTo(500, 3)
    expect(bounds.north - bounds.south).toBeCloseTo(500, 3)
  })

  it('maps raster extensions to world file extensions', () => {
    expect(worldFileExtensionForRaster('ortho.png')).toBe('pgw')
    expect(worldFileExtensionForRaster('photo.jpg')).toBe('jgw')
    expect(worldFileExtensionForRaster('scene.tiff')).toBe('tfw')
  })

  it('detects web mercator CRS from large coordinates', () => {
    expect(
      detectCrsFromBounds({ west: 4000000, east: 4500000, south: 3000000, north: 3500000 }),
    ).toBe('EPSG:3857')
    expect(detectCrsFromBounds({ west: 45, east: 46, south: 24, north: 25 })).toBe('EPSG:4326')
  })

  it('reprojects web mercator bounds to WGS84', () => {
    const wgs = webMercatorToWgs84Bounds({ west: 0, east: 1000000, south: 0, north: 1000000 })
    expect(wgs.west).toBeGreaterThan(-1)
    expect(wgs.east).toBeLessThan(20)
  })

  it('requires world sidecar for plain images without georeferencing', () => {
    const png = new File(['p'], 'scene.png')
    expect(rasterNeedsWorldSidecar(png, [])).toBe(true)
    const jgw = new File(['wf'], 'scene.pgw')
    expect(rasterNeedsWorldSidecar(png, [jgw])).toBe(false)
  })

  it('does not require sidecar for GeoTIFF at staging time', () => {
    const tif = new File(['t'], 'scene.tif')
    expect(rasterNeedsWorldSidecar(tif, [])).toBe(false)
  })
})
