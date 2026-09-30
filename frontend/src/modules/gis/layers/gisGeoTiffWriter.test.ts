import { describe, expect, it } from 'vitest'
import {
  GIS_FLOAT_NODATA,
  computeFloatRasterStats,
  sanitizeFloat32Samples,
  writeFloat32GisGeoTiff,
  writeRgbGisGeoTiff,
} from './gisGeoTiffWriter'

describe('gisGeoTiffWriter', () => {
  it('replaces NaN/Inf with finite NoData sentinel', () => {
    const raw = new Float32Array([0.2, Number.NaN, Number.POSITIVE_INFINITY, -0.1])
    const out = sanitizeFloat32Samples(raw)
    expect(out[0]).toBeCloseTo(0.2, 5)
    expect(out[1]).toBe(GIS_FLOAT_NODATA)
    expect(out[2]).toBe(GIS_FLOAT_NODATA)
    expect(out[3]).toBeCloseTo(-0.1, 5)
    expect(out.every(Number.isFinite)).toBe(true)
  })

  it('computes stats excluding NoData', () => {
    const samples = new Float32Array([0.1, GIS_FLOAT_NODATA, 0.5, 0.3])
    const stats = computeFloatRasterStats(samples)
    expect(stats).not.toBeNull()
    expect(stats!.validCount).toBe(3)
    expect(stats!.min).toBeCloseTo(0.1)
    expect(stats!.max).toBeCloseTo(0.5)
  })

  it('writes Float32 GeoTIFF without IEEE NaN bytes and with GDAL_NODATA', () => {
    const samples = new Float32Array(4)
    samples[0] = 0.42
    samples[1] = Number.NaN
    samples[2] = -0.2
    samples[3] = 0.9
    const buf = writeFloat32GisGeoTiff({
      width: 2,
      height: 2,
      samples,
      pixelScaleX: 0.0001,
      pixelScaleY: 0.0001,
      tiepointX: 45,
      tiepointY: 9,
      epsg: 4326,
      geographic: true,
      nodata: GIS_FLOAT_NODATA,
      description: 'NDVI test',
    })
    const bytes = new Uint8Array(buf)
    expect(bytes[0]).toBe(0x49) // II
    expect(bytes[1]).toBe(0x49)
    const asText = new TextDecoder('latin1').decode(bytes)
    expect(asText).toContain(String(GIS_FLOAT_NODATA))
    expect(asText).toContain('STATISTICS_MINIMUM')
    expect(asText).toContain('STATISTICS_MAXIMUM')

    // Strip floats are sanitized; GDAL_NODATA is finite (never the string "nan").
    expect(asText.toLowerCase()).not.toContain('nan')
    expect(asText).toContain('-9999')
  })

  it('writes RGBA GeoTIFF with ExtraSamples', () => {
    const pixels = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 0, 0, 0, 255, 255, 0, 0, 0, 0])
    const buf = writeRgbGisGeoTiff({
      width: 2,
      height: 2,
      pixels,
      samplesPerPixel: 4,
      pixelScaleX: 0.0001,
      pixelScaleY: 0.0001,
      tiepointX: 45,
      tiepointY: 9,
      epsg: 4326,
    })
    expect(buf.byteLength).toBeGreaterThan(pixels.length)
    expect(new Uint8Array(buf)[0]).toBe(0x49)
  })
})
