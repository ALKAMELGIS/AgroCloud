import { describe, expect, it } from 'vitest'
import { PRITHVI_CROP_CLASSES } from '../siPrithviCropPipeline'
import {
  buildClassTable,
  classRasterToRgb,
  rgbaToClassRaster,
  writePalettedGeoTiff4326,
  writeRgbGeoTiff4326,
} from './cropClassificationGeoTiffExport'

describe('cropClassificationGeoTiffExport', () => {
  it('builds stable class value table from legend', () => {
    const classes = buildClassTable({
      legend: PRITHVI_CROP_CLASSES.map(c => ({ id: c.id, name: c.name, color: c.color })),
      classStats: [
        { name: 'Corn', pct: 40 },
        { name: 'Soybeans', pct: 60 },
      ],
    })
    expect(classes).toHaveLength(2)
    expect(classes.find(c => c.name === 'Corn')?.value).toBe(3)
    expect(classes.find(c => c.name === 'Soybeans')?.value).toBe(4)
  })

  it('maps RGBA colours to class IDs and writes EPSG:4326 GeoTIFF bytes', () => {
    const classes = buildClassTable({
      legend: [
        { id: 3, name: 'Corn', color: '#f6e700' },
        { id: 4, name: 'Soybeans', color: '#1f7a1f' },
      ],
      classStats: [
        { name: 'Corn', pct: 50 },
        { name: 'Soybeans', pct: 50 },
      ],
    })
    const corn = classes.find(c => c.name === 'Corn')!
    const soy = classes.find(c => c.name === 'Soybeans')!
    // 2×2 RGBA
    const rgba = new Uint8ClampedArray([
      corn.r, corn.g, corn.b, 255,
      soy.r, soy.g, soy.b, 255,
      soy.r, soy.g, soy.b, 255,
      0, 0, 0, 0,
    ])
    const raster = rgbaToClassRaster(rgba, 2, 2, classes)
    expect(Array.from(raster)).toEqual([3, 4, 4, 0])

    const buf = writePalettedGeoTiff4326({
      width: 2,
      height: 2,
      samples: raster,
      west: 54,
      south: 24,
      east: 54.02,
      north: 24.02,
      classes,
      compress: false,
    })
    const bytes = new Uint8Array(buf)
    // Classic little-endian TIFF magic
    expect(bytes[0]).toBe(0x49)
    expect(bytes[1]).toBe(0x49)
    expect(bytes[2]).toBe(42)
    expect(buf.byteLength).toBeGreaterThan(100)

    const rgb = classRasterToRgb(raster, classes)
    expect(rgb.length).toBe(2 * 2 * 3)
    expect(Array.from(rgb.slice(0, 3))).toEqual([corn.r, corn.g, corn.b])

    const rgbBuf = writeRgbGeoTiff4326({
      width: 2,
      height: 2,
      rgb,
      west: 54,
      south: 24,
      east: 54.02,
      north: 24.02,
      compress: false,
    })
    const rgbBytes = new Uint8Array(rgbBuf)
    expect(rgbBytes[0]).toBe(0x49)
    expect(rgbBytes[2]).toBe(42)
    expect(rgbBuf.byteLength).toBeGreaterThan(100)
  })
})
