import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PNG } from 'pngjs'
import {
  bbox3857FromGeometry,
  binIndexFor,
  classifyGridToCounts,
  decodeWmsZonalStatsFromPng,
  estimateEtMmDayFromMoisture,
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

  it('classifies ET pixels directly into mm/day bins (not NDVI bins)', () => {
    const edges = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    // Mixed moisture pixels → ET across several classes (not 100% in class 0).
    const samples = [
      { ndmi: 0.4, ndwi: 0.3 }, // wet → low ET
      { ndmi: 0.1, ndwi: 0.05 }, // moderate ET
      { ndmi: -0.1, ndwi: -0.05 }, // high ET
      { ndmi: -0.3, ndwi: -0.2 }, // very high ET
    ]
    const n = samples.length
    const grid = {
      kind: 'et',
      width: n,
      height: 1,
      ndmi: Float32Array.from(samples.map(s => s.ndmi)),
      ndwi: Float32Array.from(samples.map(s => s.ndwi)),
      valid: Uint8Array.from({ length: n }, () => 1),
    }
    const { counts, sampleCount } = classifyGridToCounts(
      grid,
      { mode: 'value', index: 'et', outputId: 'idx' },
      edges,
    )
    assert.equal(sampleCount, n)
    const populated = counts.filter(c => c > 0).length
    assert.ok(populated >= 2, `expected ≥2 ET classes populated, got ${counts.join(',')}`)
    assert.ok(counts[0] < n, 'must not dump every pixel into Extremely Low ET')

    // Spot-check binning matches the formula.
    for (const s of samples) {
      const et = estimateEtMmDayFromMoisture(s.ndmi, s.ndwi)
      const bi = binIndexFor(et, edges)
      assert.ok(bi >= 0 && bi < 10)
    }
  })

  it('selectClearSceneDates accepts granule cloud >5% and prefers clearest dates', async () => {
    const { selectClearSceneDates } = await import('../server/sentinelHubWmsStatisticsEngine.js')
    const geometry = {
      type: 'Polygon',
      coordinates: [
        [
          [54.3, 24.4],
          [54.35, 24.4],
          [54.35, 24.45],
          [54.3, 24.45],
          [54.3, 24.4],
        ],
      ],
    }
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body || '{}'))
      const [from, to] = String(body.datetime || '').split('/')
      const fromDay = from.slice(0, 10)
      // Simulate a season where every scene is 8–25% tile cloud (would fail old ≤5% gate).
      const features = []
      const start = new Date(`${fromDay}T00:00:00Z`).getTime()
      const end = new Date(`${to.slice(0, 10)}T00:00:00Z`).getTime()
      for (let t = start, i = 0; t <= end; t += 5 * 86400000, i += 1) {
        const day = new Date(t).toISOString().slice(0, 10)
        features.push({
          properties: {
            datetime: `${day}T08:00:00Z`,
            'eo:cloud_cover': 8 + (i % 4) * 5, // 8, 13, 18, 23…
          },
        })
      }
      return {
        ok: true,
        async json() {
          return { features }
        },
        async text() {
          return ''
        },
      }
    }
    try {
      const selected = await selectClearSceneDates(
        geometry,
        { start: '2024-01-01', end: '2024-06-30' },
        3,
        40,
      )
      assert.ok(selected.length >= 2, `expected ≥2 dates, got ${selected.length}`)
      assert.ok(selected.every(s => s.cloudCover != null && s.cloudCover > 5 && s.cloudCover <= 40))
      assert.ok(selected.every(s => !s.cloudy))
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
