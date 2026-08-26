import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildMasterGeometry,
  spatialGroupFields,
  zonalIndexStatsFromGrid,
} from '../server/sentinelFieldBatchEngine.js'

describe('sentinelFieldBatchEngine', () => {
  it('groups nearby fields into one spatial cluster', () => {
    const fields = [
      {
        fieldKey: 'a',
        geometry: {
          type: 'Polygon',
          coordinates: [[[46.67, 24.71], [46.671, 24.71], [46.671, 24.711], [46.67, 24.711], [46.67, 24.71]]],
        },
      },
      {
        fieldKey: 'b',
        geometry: {
          type: 'Polygon',
          coordinates: [[[46.672, 24.712], [46.673, 24.712], [46.673, 24.713], [46.672, 24.713], [46.672, 24.712]]],
        },
      },
      {
        fieldKey: 'c',
        geometry: {
          type: 'Polygon',
          coordinates: [[[47.5, 25.5], [47.501, 25.5], [47.501, 25.501], [47.5, 25.501], [47.5, 25.5]]],
        },
      },
    ]
    const groups = spatialGroupFields(fields)
    assert.equal(groups.length, 2)
    const near = groups.find(g => g.fields.some(f => f.fieldKey === 'a'))
    assert.equal(near?.fields.length, 2)
  })

  it('builds a MultiPolygon master AOI for a group', () => {
    const master = buildMasterGeometry([
      {
        fieldKey: 'a',
        geometry: {
          type: 'Polygon',
          coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
        },
      },
      {
        fieldKey: 'b',
        geometry: {
          type: 'Polygon',
          coordinates: [[[2, 2], [3, 2], [3, 3], [2, 3], [2, 2]]],
        },
      },
    ])
    assert.equal(master?.type, 'MultiPolygon')
    assert.equal(master?.coordinates?.length, 2)
  })

  it('computes zonal means from a synthetic index grid', () => {
    const width = 4
    const height = 4
    const n = width * height
    const ndvi = new Float32Array(n)
    const ndwi = new Float32Array(n)
    const ndmi = new Float32Array(n)
    const valid = new Uint8Array(n)
    for (let i = 0; i < n; i += 1) {
      ndvi[i] = 0.5
      ndwi[i] = 0.1
      ndmi[i] = 0.2
      valid[i] = 1
    }
    const grid = {
      ndvi,
      ndwi,
      ndmi,
      valid,
      width,
      height,
      bbox3857: [0, 0, 400, 400],
    }
    const geometry = {
      type: 'Polygon',
      coordinates: [[[0.0005, 0.0005], [0.003, 0.0005], [0.003, 0.003], [0.0005, 0.003], [0.0005, 0.0005]]],
    }
    const stats = zonalIndexStatsFromGrid(grid, geometry)
    assert.ok(stats && stats.sampleCount > 0)
    assert.equal(stats.ndvi, 0.5)
    assert.equal(stats.ndwi, 0.1)
    assert.equal(stats.ndmi, 0.2)
  })
})
