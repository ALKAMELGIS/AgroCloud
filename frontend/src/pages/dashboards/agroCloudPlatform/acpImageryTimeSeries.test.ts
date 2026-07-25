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
    expect(groups.some(g => g.label.includes('Crop Phenology'))).toBe(true)
    expect(groups.some(g => g.label.includes('Delta'))).toBe(true)
    expect(flat.some(o => o.id === 'NDVI')).toBe(true)
    expect(flat.some(o => o.id === 'ET')).toBe(true)
    expect(flat.some(o => o.id === 'VHS')).toBe(true)
    expect(flat.some(o => o.id === 'DVHS')).toBe(true)
    expect(flat.some(o => o.id === 'CHAS')).toBe(true)
    expect(flat.some(o => o.id === 'DCHAS')).toBe(true)
    expect(flat.some(o => o.id === 'PRI')).toBe(true)
    expect(flat.some(o => o.id === 'CGI')).toBe(true)
    expect(flat.some(o => o.id === 'CVI')).toBe(true)
    expect(flat.some(o => o.id === 'CHS')).toBe(true)
    expect(flat.some(o => o.id === 'CMI')).toBe(true)
    expect(flat.some(o => o.id === 'HRI')).toBe(true)
    expect(flat.some(o => o.id === 'VRI')).toBe(true)
    expect(flat.some(o => o.id === 'CCI')).toBe(true)
    expect(flat.some(o => o.id === 'EPD')).toBe(true)
    expect(flat.some(o => o.id === 'EHD')).toBe(true)
    expect(flat.length).toBeGreaterThan(40)
  })

  it('evaluates crop phenology composites from daily means', () => {
    const row = dailyRow({ ndvi: 0.6, ndmi: 0.3, ndwi: 0.2, evi: 0.55, ndre: 0.4, savi: 0.5 })
    expect(evaluateImageryLayerDailyValue('PRI', row)).toBeCloseTo(
      0.35 * 0.6 + 0.25 * 0.3 + 0.2 * 0.2 + 0.1 * 0.5 + 0.1 * 0.55,
      4,
    )
    expect(evaluateImageryLayerDailyValue('CGI', row)).toBeCloseTo(
      0.4 * 0.6 + 0.3 * 0.55 + 0.2 * 0.4 + 0.1 * 0.3,
      4,
    )
    expect(evaluateImageryLayerDailyValue('CVI', row)).toBeCloseTo(0.5 * 0.6 + 0.3 * 0.55 + 0.2 * 0.4, 4)
    expect(evaluateImageryLayerDailyValue('CHS', row)).toBeCloseTo(
      0.3 * 0.6 + 0.25 * 0.4 + 0.2 * 0.55 + 0.15 * 0.3 + 0.1 * 0.5,
      4,
    )
    expect(evaluateImageryLayerDailyValue('CMI', row)).toBeCloseTo(0.5 * 0.4 + 0.3 * 0.6 + 0.2 * 0.55, 4)
    expect(evaluateImageryLayerDailyValue('HRI', row)).toBeCloseTo(
      0.4 * (1 - 0.6) + 0.25 * (1 - 0.4) + 0.2 * (1 - 0.3) + 0.15 * (1 - 0.5),
      4,
    )
  })

  it('aggregates VRI / CCI / EPD / EHD time series', () => {
    const map = new Map<string, SentinelHubDailyIndexMeans[]>()
    map.set('f1', [
      dailyRow({ date: '2026-03-01', ndvi: 0.2, ndmi: 0.15, ndwi: 0.1, evi: 0.18, ndre: 0.12, savi: 0.18 }),
      dailyRow({ date: '2026-03-10', ndvi: 0.35, ndmi: 0.22, ndwi: 0.15, evi: 0.3, ndre: 0.2, savi: 0.28 }),
      dailyRow({ date: '2026-03-20', ndvi: 0.55, ndmi: 0.35, ndwi: 0.25, evi: 0.5, ndre: 0.35, savi: 0.45 }),
      dailyRow({ date: '2026-04-01', ndvi: 0.7, ndmi: 0.4, ndwi: 0.28, evi: 0.62, ndre: 0.45, savi: 0.55 }),
      dailyRow({ date: '2026-05-15', ndvi: 0.45, ndmi: 0.2, ndwi: 0.12, evi: 0.4, ndre: 0.5, savi: 0.35 }),
      dailyRow({ date: '2026-06-01', ndvi: 0.3, ndmi: 0.1, ndwi: 0.08, evi: 0.25, ndre: 0.4, savi: 0.22 }),
    ])
    const vri = aggregateImageryTimeSeries(map, ['f1'], 'VRI')
    expect(vri.values.some(v => Number.isFinite(v))).toBe(true)
    expect(Math.max(...vri.values.filter(Number.isFinite))).toBeCloseTo(1, 3)
    expect(Math.min(...vri.values.filter(Number.isFinite))).toBeCloseTo(0, 3)

    const cci = aggregateImageryTimeSeries(map, ['f1'], 'CCI')
    expect(cci.values.every(v => !Number.isFinite(v) || (v >= 0 && v <= 1))).toBe(true)

    const epd = aggregateImageryTimeSeries(map, ['f1'], 'EPD')
    expect(epd.values.includes(1)).toBe(true)
    expect(epd.values[0]).toBe(0)

    const ehd = aggregateImageryTimeSeries(map, ['f1'], 'EHD')
    expect(ehd.values.includes(1)).toBe(true)
  })

  it('evaluates composite and core indices from daily means', () => {
    const row = dailyRow({ ndvi: 0.8, ndmi: 0.4, ndwi: 0.2 })
    expect(evaluateImageryLayerDailyValue('NDVI', row)).toBe(0.8)
    const et = evaluateImageryLayerDailyValue('ET', row)
    expect(et).not.toBeNull()
    expect(et!).toBeGreaterThan(0)
    const lst = evaluateImageryLayerDailyValue('LST', row)
    expect(lst).not.toBeNull()
    expect(lst!).toBeGreaterThan(5)
    expect(lst!).toBeLessThan(55)
    expect(evaluateImageryLayerDailyValue('VHS', row)).toBeCloseTo(0.79, 2)
    expect(evaluateImageryLayerDailyValue('CHAS', row)).not.toBeNull()
  })

  it('derives LST from NDVI and NDMI with seasonal scene date', () => {
    const cool = dailyRow({ date: '2026-01-15', ndvi: 0.55, ndmi: 0.25 })
    const hot = dailyRow({ date: '2026-07-15', ndvi: 0.25, ndmi: -0.1 })
    const coolLst = evaluateImageryLayerDailyValue('LST', cool)
    const hotLst = evaluateImageryLayerDailyValue('LST', hot)
    expect(coolLst).not.toBeNull()
    expect(hotLst).not.toBeNull()
    expect(hotLst!).toBeGreaterThan(coolLst!)
  })

  it('returns null LST when NDVI or NDMI is missing', () => {
    expect(evaluateImageryLayerDailyValue('LST', dailyRow({ ndvi: null, ndmi: 0.2 }))).toBeNull()
    expect(evaluateImageryLayerDailyValue('LST', dailyRow({ ndvi: 0.5, ndmi: null }))).toBeNull()
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
