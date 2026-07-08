import { describe, expect, it } from 'vitest'
import {
  buildImageryTsCacheKey,
  buildImageryTsChunkCacheKey,
  findImageryTsOverlappingDaily,
  setImageryTsMemoryCache,
  writeImageryTsChunkCache,
} from './imageryTimeSeriesCache'

describe('imageryTimeSeriesCache overlap', () => {
  it('builds chunk cache keys scoped to geometry and range', () => {
    expect(buildImageryTsChunkCacheKey('geom1', '2024-01-01', '2024-03-31', 65)).toBe(
      'chunk|geom1|2024-01-01|2024-03-31|65|v1',
    )
  })

  it('merges overlapping in-memory range and chunk caches for instant Apply', async () => {
    const fieldKey = 'drawn-aoi'
    const geometryHash = 'geom1'
    const cloudFilter = 65

    setImageryTsMemoryCache({
      cacheKey: buildImageryTsCacheKey({
        fieldKey,
        geometryHash,
        fromIso: '2026-04-09',
        toIso: '2026-07-08',
        cloudFilter,
      }),
      fieldKey,
      fromIso: '2026-04-09',
      toIso: '2026-07-08',
      cloudFilter,
      daily: [
        { date: '2026-06-01', ndvi: 0.42 },
        { date: '2026-07-01', ndvi: 0.51 },
      ],
      savedAt: Date.now(),
      expiresAt: Date.now() + 60_000,
    })

    await writeImageryTsChunkCache(
      buildImageryTsChunkCacheKey(geometryHash, '2025-01-01', '2025-03-31', cloudFilter),
      [{ date: '2025-02-15', ndvi: 0.33 }],
    )

    const merged = findImageryTsOverlappingDaily({
      fieldKey,
      geometryHash,
      fromIso: '2025-01-01',
      toIso: '2026-07-08',
      cloudFilter,
    })

    expect(merged.map(row => row.date)).toEqual(['2025-02-15', '2026-06-01', '2026-07-01'])
  })
})
