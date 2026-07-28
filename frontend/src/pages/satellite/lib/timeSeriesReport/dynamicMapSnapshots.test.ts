import { describe, expect, it } from 'vitest'
import {
  collectLayerSnapshotDates,
  pickSnapshotSceneDateCandidates,
  resolveDynamicSnapshotStats,
} from './dynamicMapSnapshots'
import type { SentinelHubDailyIndexMeans } from '../../../../lib/sentinelHubStatisticsApi'

describe('dynamicMapSnapshots', () => {
  it('resolves zonal stats when present on daily row', () => {
    const rows: SentinelHubDailyIndexMeans[] = [
      {
        date: '2026-03-01',
        ndvi: 0.5,
        ndwi: null,
        ndmi: null,
        evi: null,
        savi: null,
        ciRe: null,
        zonal: {
          ndvi: { min: 0.2, max: 0.8, mean: 0.55 },
        },
      },
    ]
    const stats = resolveDynamicSnapshotStats('NDVI', '2026-03-01', rows, 0.4)
    expect(stats.mean).toBe(0.55)
    expect(stats.min).toBe(0.2)
    expect(stats.max).toBe(0.8)
  })

  it('falls back to series mean when daily value missing', () => {
    const stats = resolveDynamicSnapshotStats('SAVI', '2026-03-01', [], 0.42)
    expect(stats.mean).toBe(0.42)
    expect(stats.min).toBe(0.42)
    expect(stats.max).toBe(0.42)
  })

  it('collects dates with finite layer means and picks nearest candidates', () => {
    const rows: SentinelHubDailyIndexMeans[] = [
      {
        date: '2026-07-10',
        ndvi: 0.4,
        ndwi: null,
        ndmi: null,
        evi: null,
        savi: null,
        ciRe: null,
      },
      {
        date: '2026-07-20',
        ndvi: 0.5,
        ndwi: null,
        ndmi: null,
        evi: null,
        savi: null,
        ciRe: null,
      },
      {
        date: '2026-07-22',
        ndvi: null,
        ndwi: null,
        ndmi: null,
        evi: null,
        savi: null,
        ciRe: null,
      },
    ]
    expect(collectLayerSnapshotDates('NDVI', rows)).toEqual(['2026-07-10', '2026-07-20'])
    const candidates = pickSnapshotSceneDateCandidates('2026-07-22', ['2026-07-10', '2026-07-20'])
    expect(candidates[0]).toBe('2026-07-22')
    expect(candidates).toContain('2026-07-20')
  })
})
