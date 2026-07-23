import { describe, expect, it } from 'vitest'
import {
  aggregateImageryTimeSeries,
  aggregateImageryTimeSeriesMulti,
  buildImageryCorrelationScatterAnalysis,
  buildImageryPieChartSlices,
  buildImageryScatterPoints,
  aggregateImageryChartByTimePeriod,
  bucketImagerySeriesByMonth,
  buildImageryTimeSeriesLayerGroups,
  classifyScatterRelationship,
  computeLinearRegression,
  evaluateImageryLayerDailyValue,
  flattenImageryTimeSeriesLayerOptions,
  pruneImageryTimeSeriesToObservations,
  pruneSingleLayerImagerySeries,
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
    expect(flat.some(o => o.id === 'ET')).toBe(true)
    expect(flat.some(o => o.id === 'VHS')).toBe(true)
    expect(flat.some(o => o.id === 'DVHS')).toBe(true)
    expect(flat.some(o => o.id === 'CHAS')).toBe(true)
    expect(flat.some(o => o.id === 'DCHAS')).toBe(true)
    expect(flat.length).toBeGreaterThan(40)
  })

  it('evaluates composite and core indices from daily means', () => {
    const row = dailyRow({ ndvi: 0.8, ndmi: 0.4, ndwi: 0.2 })
    expect(evaluateImageryLayerDailyValue('NDVI', row)).toBe(0.8)
    const et = evaluateImageryLayerDailyValue('ET', row)
    expect(et).not.toBeNull()
    expect(et!).toBeGreaterThan(0)
    expect(evaluateImageryLayerDailyValue('VHS', row)).toBeCloseTo(0.79, 2)
    expect(evaluateImageryLayerDailyValue('CHAS', row)).not.toBeNull()
  })

  it('evaluates salinity NDSI / SI / SSI without requiring NDVI', () => {
    const row = dailyRow({
      ndvi: null,
      ndmi: null,
      ndwi: null,
      ndsi: 0.25,
      si: 0.1,
      ssi: 0.35,
    })
    expect(evaluateImageryLayerDailyValue('NDSI', row)).toBe(0.25)
    expect(evaluateImageryLayerDailyValue('SI', row)).toBe(0.1)
    expect(evaluateImageryLayerDailyValue('SSI', row)).toBe(0.35)
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

  it('builds NCADI as consecutive fusion deltas and ADI as rolling z-score', () => {
    const map = new Map<string, SentinelHubDailyIndexMeans[]>([
      [
        'f1',
        [
          dailyRow({ date: '2026-06-01', ndvi: 0.4, ndmi: 0.2, ndre: 0.3 }),
          dailyRow({ date: '2026-06-10', ndvi: 0.6, ndmi: 0.3, ndre: 0.4 }),
          dailyRow({ date: '2026-06-20', ndvi: 0.8, ndmi: 0.4, ndre: 0.5 }),
        ],
      ],
    ])
    const ncadi = aggregateImageryTimeSeries(map, ['f1'], 'NCADI')
    expect(Number.isNaN(ncadi.values[0]!)).toBe(true)
    expect(ncadi.values[1]).toBeCloseTo(0.7 * 0.2 + 0.3 * 0.1, 4)

    const adi = aggregateImageryTimeSeries(map, ['f1'], 'ADI')
    expect(Number.isNaN(adi.values[0]!)).toBe(true)
    expect(Number.isFinite(adi.values[1]!)).toBe(true)
    expect(Number.isFinite(adi.values[2]!)).toBe(true)
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
    expect(multi.series[0]?.values[0]).toBe(0.6)
    expect(multi.series[1]?.values[1]).toBe(0.4)
  })

  it('builds multi-layer series including NDSI on a shared date axis', () => {
    const map = new Map<string, SentinelHubDailyIndexMeans[]>([
      [
        'f1',
        [
          dailyRow({ date: '2026-06-01', ndvi: 0.6, ndmi: 0.3, ndsi: 0.1 }),
          dailyRow({ date: '2026-06-10', ndvi: 0.8, ndmi: 0.4, ndsi: 0.2 }),
        ],
      ],
    ])
    const multi = aggregateImageryTimeSeriesMulti(map, ['f1'], ['NDVI', 'NDSI'])
    expect(multi.labels).toEqual(['2026-06-01', '2026-06-10'])
    expect(multi.series).toHaveLength(2)
    expect(multi.series[0]?.layerId).toBe('NDVI')
    expect(multi.series[0]?.values[0]).toBe(0.6)
    expect(multi.series[1]?.layerId).toBe('NDSI')
    expect(multi.series[1]?.values[1]).toBe(0.2)
  })

  it('prunes dates without finite layer values', () => {
    const labels = ['2026-06-01', '2026-06-02', '2026-06-03']
    const series = [
      { layerId: 'NDVI', values: [0.5, NaN, 0.7] },
      { layerId: 'NDMI', values: [NaN, 0.3, NaN] },
    ]
    const pruned = pruneImageryTimeSeriesToObservations(labels, series)
    expect(pruned.labels).toEqual(['2026-06-01', '2026-06-02', '2026-06-03'])
    expect(pruned.series[0]?.values).toEqual([0.5, NaN, 0.7])
    expect(pruned.series[1]?.values).toEqual([NaN, 0.3, NaN])
  })

  it('prunes single-layer series to observation dates only', () => {
    const { labels, values } = pruneSingleLayerImagerySeries(
      ['2026-06-01', '2026-06-02'],
      [0.42, NaN],
    )
    expect(labels).toEqual(['2026-06-01'])
    expect(values).toEqual([0.42])
  })

  it('aggregates daily chart series by week, month, and year', () => {
    const labels = ['2026-06-01', '2026-06-10', '2026-06-15', '2026-07-05']
    const series = [{ layerId: 'NDVI', values: [0.6, 0.8, 0.7, 0.5] }]

    const monthly = aggregateImageryChartByTimePeriod(labels, series, 'month')
    expect(monthly.labels).toEqual(['2026-06', '2026-07'])
    expect(monthly.series[0]?.values[0]).toBeCloseTo(0.7, 2)
    expect(monthly.periodAnchorDate.get('2026-06')).toBe('2026-06-15')

    const yearly = aggregateImageryChartByTimePeriod(labels, series, 'year')
    expect(yearly.labels).toEqual(['2026'])
    expect(yearly.series[0]?.values[0]).toBeCloseTo(0.65, 2)

    const daily = aggregateImageryChartByTimePeriod(labels, series, 'day')
    expect(daily.labels).toEqual(labels)
    expect(daily.series[0]?.values).toEqual(series[0]!.values)
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

  it('computes correlation scatter regression, R², and relationship labels', () => {
    const labels = ['2026-06-01', '2026-06-10', '2026-06-20', '2026-07-01']
    const ndvi = [0.4, 0.5, 0.6, 0.7]
    const ndmi = [0.1, 0.2, 0.3, 0.4]

    const analysis = buildImageryCorrelationScatterAnalysis(labels, 'NDVI', ndvi, 'NDMI', ndmi)
    expect(analysis).not.toBeNull()
    expect(analysis!.points).toHaveLength(4)
    expect(analysis!.regression.r2).toBeGreaterThan(0.95)
    expect(analysis!.regression.slope).toBeGreaterThan(0)
    expect(analysis!.relationship.label).toMatch(/Strong Positive/)
    expect(analysis!.regressionLine).toHaveLength(2)
    expect(analysis!.gisInsight).toContain('R²=')
    expect(analysis!.agroInsight).toContain('Agro ·')

    const regression = computeLinearRegression([
      { x: 0.8, y: 0.2 },
      { x: 0.6, y: 0.4 },
      { x: 0.4, y: 0.6 },
    ])
    expect(regression).not.toBeNull()
    expect(regression!.r).toBeLessThan(0)
    expect(classifyScatterRelationship(regression!).direction).toBe('negative')
  })
})
