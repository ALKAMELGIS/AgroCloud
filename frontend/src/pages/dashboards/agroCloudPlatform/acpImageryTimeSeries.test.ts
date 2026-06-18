import { describe, expect, it } from 'vitest'
import {
  aggregateImageryTimeSeries,
  aggregateImageryTimeSeriesMulti,
  buildImageryPieChartSlices,
  buildImageryScatterPoints,
  bucketImagerySeriesByMonth,
  buildImageryTimeSeriesLayerGroups,
  evaluateImageryLayerDailyValue,
  flattenImageryTimeSeriesLayerOptions,
} from './acpImageryTimeSeries'
import type { SentinelHubDailyIndexMeans } from '../../../lib/sentinelHubStatisticsApi'

function dailyRow(overrides: Partial<SentinelHubDailyIndexMeans> = {}): SentinelHubDailyIndexMeans {
  return {
    date: '2026-06-10',
    ndvi: 0.8,
    ndwi: 0.2,
    ndmi: 0.4,
    evi: 0.82,
    ciRe: 0.12,
    ...overrides,
  }
}

describe('acpImageryTimeSeries', () => {
  it('exposes full Layer Live catalog groups like Satellite Intelligence', () => {
    const groups = buildImageryTimeSeriesLayerGroups()
    const flat = flattenImageryTimeSeriesLayerOptions()
    expect(groups.some(g => g.label.includes('Core Interpretation'))).toBe(true)
    expect(groups.some(g => g.label.includes('Vegetation Health'))).toBe(true)
    expect(groups.some(g => g.label.includes('Delta'))).toBe(true)
    expect(flat.some(o => o.id === 'NDVI')).toBe(true)
    expect(flat.some(o => o.id === 'VHS')).toBe(true)
    expect(flat.some(o => o.id === 'DVHS')).toBe(true)
    expect(flat.some(o => o.id === 'CHAS')).toBe(true)
    expect(flat.some(o => o.id === 'DCHAS')).toBe(true)
    expect(flat.length).toBeGreaterThan(40)
  })

  it('evaluates composite and core indices from daily means', () => {
    const row = dailyRow({ ndvi: 0.8, ndmi: 0.4, ndwi: 0.2 })
    expect(evaluateImageryLayerDailyValue('NDVI', row)).toBe(0.8)
    expect(evaluateImageryLayerDailyValue('VHS', row)).toBeCloseTo(0.79, 2)
    expect(evaluateImageryLayerDailyValue('CHAS', row)).not.toBeNull()
  })

  it('builds delta time series from consecutive static composite scenes', () => {
    const map = new Map<string, SentinelHubDailyIndexMeans[]>([
      [
        'f1',
        [
          dailyRow({ date: '2026-06-01', ndvi: 0.6 }),
          dailyRow({ date: '2026-06-10', ndvi: 0.8 }),
        ],
      ],
    ])
    const series = aggregateImageryTimeSeries(map, ['f1'], 'DVHS')
    expect(series.labels).toEqual(['2026-06-01', '2026-06-10'])
    expect(Number.isNaN(series.values[0]!)).toBe(true)
    expect(series.values[1]).toBeGreaterThan(0)
  })

  it('builds multi-layer time series on a shared date axis', () => {
    const map = new Map<string, SentinelHubDailyIndexMeans[]>([
      [
        'f1',
        [
          dailyRow({ date: '2026-06-01', ndvi: 0.6, ndmi: 0.3 }),
          dailyRow({ date: '2026-06-10', ndvi: 0.8, ndmi: 0.4 }),
        ],
      ],
    ])
    const multi = aggregateImageryTimeSeriesMulti(map, ['f1'], ['NDVI', 'NDMI'])
    expect(multi.labels).toEqual(['2026-06-01', '2026-06-10'])
    expect(multi.series).toHaveLength(2)
    expect(multi.series[0]?.layerId).toBe('NDVI')
    expect(multi.series[0]?.values[1]).toBe(0.8)
    expect(multi.series[1]?.layerId).toBe('NDMI')
    expect(multi.series[1]?.values[1]).toBe(0.4)
  })

  it('builds pie slices by layer mean or monthly buckets', () => {
    const multi = buildImageryPieChartSlices(
      ['2026-06-01', '2026-06-10'],
      [
        { layerId: 'NDVI', values: [0.6, 0.8] },
        { layerId: 'NDMI', values: [0.3, 0.4] },
      ],
    )
    expect(multi.labels).toEqual(['NDVI', 'NDMI'])
    expect(multi.values[0]).toBeCloseTo(0.7, 2)

    const monthly = bucketImagerySeriesByMonth(
      ['2026-06-01', '2026-06-10', '2026-07-05'],
      [0.6, 0.8, 0.5],
    )
    expect(monthly.labels).toEqual(['2026-06', '2026-07'])
  })

  it('builds scatter points from scene dates', () => {
    const points = buildImageryScatterPoints(['2026-06-01', '2026-06-10'], [0.6, NaN])
    expect(points).toHaveLength(1)
    expect(points[0]?.y).toBe(0.6)
  })
})
