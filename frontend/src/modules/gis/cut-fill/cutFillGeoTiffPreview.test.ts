import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { worldPxToLngLat } from '@/modules/ai/detection/tree/webMercatorTiles'
import {
  createCutFillRasterGrid,
  encodeRgbaPng,
  registerCutFillRasterGrid,
  renderCutFillTilePng,
  unregisterCutFillRasterGrid,
} from './cutFillGeoTiffPreview'

function inflatePng(png: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = []
  let offset = 8
  while (offset + 8 <= png.length) {
    const len = new DataView(png.buffer, png.byteOffset + offset, 4).getUint32(0)
    const type = String.fromCharCode(png[offset + 4]!, png[offset + 5]!, png[offset + 6]!, png[offset + 7]!)
    const data = png.subarray(offset + 8, offset + 8 + len)
    if (type === 'IDAT') parts.push(data)
    offset += 12 + len
    if (type === 'IEND') break
  }
  const zipped = new Uint8Array(parts.reduce((n, part) => n + part.length, 0))
  let cursor = 0
  for (const part of parts) {
    zipped.set(part, cursor)
    cursor += part.length
  }
  return new Uint8Array(inflateSync(zipped))
}

describe('cutFill GeoTIFF preview tiles', () => {
  it('writes an EPSG:4326 RGBA GeoTIFF and paints CUT cells into the matching map tile', () => {
    const zoom = 1
    const originWorldPxX = 100
    const originWorldPxY = 80
    const [lng, lat] = worldPxToLngLat(originWorldPxX + 0.5, originWorldPxY + 0.5, zoom)
    const grid = createCutFillRasterGrid({
      id: 'class-test',
      mode: 'class',
      width: 2,
      height: 2,
      zoom,
      originWorldPxX,
      originWorldPxY,
      west: lng - 0.01,
      south: lat - 0.01,
      east: lng + 0.01,
      north: lat + 0.01,
      difference: new Float32Array([-4, Number.NaN, 3, 0]),
      classification: new Uint8Array([1, 0, 2, 0]),
    })
    expect(new Uint8Array(grid.geotiff, 0, 4)).toEqual(new Uint8Array([0x49, 0x49, 42, 0]))
    expect(grid.rgba[0]).toBe(220)
    expect(grid.rgba[3]).toBe(255)
    expect(grid.rgba[7]).toBe(0)

    registerCutFillRasterGrid(grid)
    const png = renderCutFillTilePng(grid.id, zoom, 0, 0)
    unregisterCutFillRasterGrid(grid.id)
    expect(Array.from(png.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
    const raw = inflatePng(png)
    const stride = 256 * 4 + 1
    const px = 100
    const py = 80
    const i = py * stride + 1 + px * 4
    expect(Array.from(raw.slice(i, i + 4))).toEqual([220, 38, 38, 255])
    const outside = raw[0 * stride + 1]
    expect(outside).toBe(0)
  })

  it('leaves cells outside the AOI transparent', () => {
    const png = encodeRgbaPng(1, 1, new Uint8Array([0, 0, 0, 0]))
    expect(Array.from(png.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
  })
})
