import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PNG } from 'pngjs'
import {
  bbox3857FromGeometry,
  decodeWmsZonalStatsFromPng,
  geometryToWmsClipWkt3857,
} from '../server/sentinelHubWmsStatisticsEngine.js'

describe('sentinelHubWmsStatisticsEngine', () => {
  it('geometryToWmsClipWkt3857 builds EPSG:3857 polygon WKT', () => {
    const wkt = geometryToWmsClipWkt3857({
      type: 'Polygon',
      coordinates: [
        [
          [54.3, 24.4],
          [54.31, 24.4],
          [54.31, 24.41],
          [54.3, 24.41],
          [54.3, 24.4],
        ],
      ],
    })
    assert.match(wkt, /^POLYGON\(\(/)
    assert.match(wkt, /\d+\.\d+ \d+\.\d+/)
  })

  it('bbox3857FromGeometry returns finite mercator bounds', () => {
    const bbox = bbox3857FromGeometry({
      type: 'Polygon',
      coordinates: [
        [
          [54.3, 24.4],
          [54.31, 24.41],
          [54.3, 24.41],
          [54.3, 24.4],
        ],
      ],
    })
    assert.ok(bbox)
    assert.equal(bbox.length, 4)
    assert.ok(bbox[0] < bbox[2])
    assert.ok(bbox[1] < bbox[3])
  })

  it('decodeWmsZonalStatsFromPng averages encoded index bytes', () => {
    const png = new PNG({ width: 2, height: 2 })
    for (let i = 0; i < png.data.length; i += 4) {
      png.data[i] = 191 // ndvi ~ 0.5
      png.data[i + 1] = 127 // ndwi ~ 0
      png.data[i + 2] = 63 // ndmi ~ -0.5
      png.data[i + 3] = 255
    }
    const stats = decodeWmsZonalStatsFromPng(PNG.sync.write(png))
    assert.equal(stats.sampleCount, 4)
    assert.ok(Math.abs((stats.ndvi ?? 0) - 0.5039) < 0.02)
    assert.ok(Math.abs((stats.ndwi ?? 0) - 0) < 0.02)
    assert.ok(Math.abs((stats.ndmi ?? 0) + 0.5039) < 0.02)
  })
})
