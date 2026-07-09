import { describe, expect, it } from 'vitest'
import {
  mergeDailyIndexSeries,
  parseSentinelHubStatsResponse,
  pickCatalogSceneDatesForFetch,
  pickDailyIndexValue,
  resolveImageryStatisticsFetchMode,
  simplifyGeometryForSentinelStats,
} from './sentinelHubStatisticsApi'

describe('sentinelHubStatisticsApi', () => {
  it('parseSentinelHubStatsResponse extracts daily means including snow NDSI', () => {
    const daily = parseSentinelHubStatsResponse({
      status: 'OK',
      data: [
        {
          interval: { from: '2026-06-08T00:00:00Z', to: '2026-06-09T00:00:00Z' },
          outputs: {
            indices: {
              bands: {
                ndvi: { stats: { mean: 0.62, sampleCount: 120, noDataCount: 4 } },
                ndwi: { stats: { mean: 0.18, sampleCount: 120, noDataCount: 4 } },
                ndmi: { stats: { mean: 0.31, sampleCount: 120, noDataCount: 4 } },
                evi: { stats: { mean: 0.44, sampleCount: 120, noDataCount: 4 } },
                ndsi: { stats: { mean: -0.08, sampleCount: 120, noDataCount: 4 } },
              },
            },
          },
        },
      ],
    })
    expect(daily).toHaveLength(1)
    expect(daily[0]?.date).toBe('2026-06-08')
    expect(daily[0]?.ndvi).toBe(0.62)
    expect(daily[0]?.ndsi).toBe(-0.08)
  })

  it('resolveImageryStatisticsFetchMode uses snow evalscript for NDSI-only', () => {
    expect(resolveImageryStatisticsFetchMode(['NDSI'])).toBe('snow-ndsi')
    expect(resolveImageryStatisticsFetchMode(['NDVI'])).toBe('multi')
    expect(resolveImageryStatisticsFetchMode(['NDVI', 'NDSI'])).toBe('multi')
  })

  it('pickDailyIndexValue finds nearest date', () => {
    const v = pickDailyIndexValue(
      [
        { date: '2026-06-01', ndvi: 0.5, ndwi: null, ndmi: null, evi: null },
        { date: '2026-06-08', ndvi: 0.7, ndwi: null, ndmi: null, evi: null },
      ],
      '2026-06-07',
      'ndvi',
    )
    expect(v).toBe(0.7)
  })

  it('simplifyGeometryForSentinelStats decimates rings', () => {
    const ring = Array.from({ length: 80 }, (_, i) => [55 + i * 0.001, 25 + i * 0.001])
    ring.push(ring[0]!)
    const g = simplifyGeometryForSentinelStats({ type: 'Polygon', coordinates: [ring] })
    expect(g?.type).toBe('Polygon')
    const out = (g as GeoJSON.Polygon).coordinates[0]!
    expect(out.length).toBeLessThan(45)
  })

  it('pickCatalogSceneDatesForFetch returns newest scenes on or before reference', () => {
    const dates = pickCatalogSceneDatesForFetch(
      ['2026-06-08T10:00:00Z', '2026-06-05', '2026-05-30', '2026-06-09'],
      '2026-06-08',
      3,
    )
    expect(dates).toEqual(['2026-06-08', '2026-06-05', '2026-05-30'])
  })

  it('mergeDailyIndexSeries prefers rows with valid ndvi', () => {
    const merged = mergeDailyIndexSeries(
      [{ date: '2026-06-05', ndvi: null, ndwi: null, ndmi: null, evi: null }],
      [{ date: '2026-06-05', ndvi: 0.71, ndwi: 0.2, ndmi: 0.3, evi: 0.4 }],
    )
    expect(merged[0]?.ndvi).toBe(0.71)
  })

  it('parseSentinelHubStatsResponse reads zonal min max mean bands', () => {
    const rows = parseSentinelHubStatsResponse({
      data: [
        {
          interval: { from: '2026-06-10T00:00:00Z', to: '2026-06-11T00:00:00Z' },
          outputs: {
            indices: {
              bands: {
                ndvi: { stats: { min: 0.55, max: 0.88, mean: 0.72, sampleCount: 120, noDataCount: 0 } },
                ndmi: { stats: { min: 0.2, max: 0.45, mean: 0.33, sampleCount: 120, noDataCount: 0 } },
                ndwi: { stats: { min: 0.1, max: 0.28, mean: 0.19, sampleCount: 120, noDataCount: 0 } },
                evi: { stats: { min: 0.5, max: 0.9, mean: 0.7, sampleCount: 120, noDataCount: 0 } },
              },
            },
          },
        },
      ],
    })
    expect(rows[0]?.ndvi).toBe(0.72)
    expect(rows[0]?.zonal?.ndvi).toEqual({ min: 0.55, max: 0.88, mean: 0.72 })
    expect(rows[0]?.zonal?.ndmi?.min).not.toBe(rows[0]?.zonal?.ndmi?.max)
  })
})
