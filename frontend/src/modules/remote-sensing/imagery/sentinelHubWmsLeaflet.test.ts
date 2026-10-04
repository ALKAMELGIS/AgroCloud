import { describe, expect, it } from 'vitest'
import { tileCoordsToBboxEpsg3857 } from './sentinelHubWmsLeaflet'

describe('tileCoordsToBboxEpsg3857', () => {
  it('matches Web Mercator northwest tile at z=3', () => {
    const bbox = tileCoordsToBboxEpsg3857(0, 0, 3)
    const [minX, minY, maxX, maxY] = bbox.split(',').map(Number)
    expect(minX).toBeCloseTo(-20_037_508.34, 0)
    expect(maxX).toBeCloseTo(-15_028_131.26, 0)
    expect(minY).toBeCloseTo(15_028_131.26, 0)
    expect(maxY).toBeCloseTo(20_037_508.34, 0)
  })

  it('tile width equals one 256px column at zoom z', () => {
    const z = 10
    const a = tileCoordsToBboxEpsg3857(100, 200, z).split(',').map(Number)
    const b = tileCoordsToBboxEpsg3857(101, 200, z).split(',').map(Number)
    const width = a[2]! - a[0]!
    expect(b[0]! - a[2]!).toBeCloseTo(0, 5)
    expect(b[2]! - b[0]!).toBeCloseTo(width, 3)
  })
})
