import { describe, expect, it } from 'vitest'
import {
  collectCumulativePeriodPicks,
  cumulativeAggregationMode,
} from './timeSeriesCumulativeMaps'
import {
  buildCropPlantingRecommendations,
  resolveSalinityMeanFromStats,
} from './timeSeriesCropRecommendations'
import { buildLayerCorrelationAnalyses } from './timeSeriesScatterChartRenderer'
import type { SentinelHubDailyIndexMeans } from '../../../../lib/sentinelHubStatisticsApi'

describe('cumulativeAggregationMode', () => {
  it('maps day aggregation to yearly cumulative appendix', () => {
    expect(cumulativeAggregationMode('day')).toBe('year')
    expect(cumulativeAggregationMode('week')).toBe('week')
    expect(cumulativeAggregationMode('month')).toBe('month')
    expect(cumulativeAggregationMode('year')).toBe('year')
  })
})

describe('collectCumulativePeriodPicks', () => {
  it('picks peak mean scene per year', () => {
    const dailyRows = [
      { date: '2024-03-01', ndvi: 0.2, ndwi: null, ndmi: null, evi: null, savi: null, ciRe: null },
      { date: '2024-07-15', ndvi: 0.55, ndwi: null, ndmi: null, evi: null, savi: null, ciRe: null },
      { date: '2024-11-01', ndvi: 0.3, ndwi: null, ndmi: null, evi: null, savi: null, ciRe: null },
      { date: '2025-04-01', ndvi: 0.4, ndwi: null, ndmi: null, evi: null, savi: null, ciRe: null },
      { date: '2025-08-01', ndvi: 0.62, ndwi: null, ndmi: null, evi: null, savi: null, ciRe: null },
    ] as SentinelHubDailyIndexMeans[]

    const picks = collectCumulativePeriodPicks({
      layerId: 'NDVI',
      dailyRows,
      timeAggregation: 'day',
    })
    expect(picks.map(p => p.periodKey)).toEqual(['2024', '2025'])
    expect(picks[0]?.sceneDate).toBe('2024-07-15')
    expect(picks[1]?.sceneDate).toBe('2025-08-01')
  })
})

describe('buildCropPlantingRecommendations', () => {
  it('returns crop options for hot subtropical AOI', () => {
    const rec = buildCropPlantingRecommendations({
      centroidLat: 24.5,
      centroidLng: 54.3,
      areaHa: 120,
      weather: {
        timezone: 'Asia/Dubai',
        lat: 24.5,
        lng: 54.3,
        aggregation: 'month',
        points: [],
        hourlyPoints: [],
        summary: {
          avgTemperatureC: 30,
          totalRainfallMm: 40,
          avgHumidityPct: 45,
          avgWindSpeedMs: 3,
        },
        correlationNotes: [],
        dataSource: 'test',
      },
      statistics: [{ layerId: 'NDVI', mean: 0.35, min: 0.1, max: 0.6, trend: 'Stable' }],
      salinityMean: 0.05,
      ndviMean: 0.35,
      ndmiMean: 0.08,
    })
    expect(rec.crops.length).toBeGreaterThan(0)
    expect(rec.bullets.length).toBeGreaterThan(2)
    expect(rec.climateBand.toLowerCase()).toMatch(/subtropical|tropical|temperate|hot/)
  })
})

describe('resolveSalinityMeanFromStats', () => {
  it('reads SAL_NDSI when present', () => {
    expect(
      resolveSalinityMeanFromStats([
        { layerId: 'NDVI', mean: 0.4, min: 0, max: 1, trend: 'Stable' },
        { layerId: 'SAL_NDSI', mean: 0.22, min: 0, max: 1, trend: 'Increasing' },
      ]),
    ).toBe(0.22)
  })
})

describe('buildLayerCorrelationAnalyses', () => {
  it('computes R² for two aligned series', () => {
    const analyses = buildLayerCorrelationAnalyses({
      labels: ['a', 'b', 'c', 'd'],
      series: [
        { layerId: 'NDVI', values: [0.2, 0.3, 0.4, 0.5] },
        { layerId: 'NDMI', values: [0.1, 0.15, 0.2, 0.25] },
      ],
      layerIds: ['NDVI', 'NDMI'],
    })
    expect(analyses).toHaveLength(1)
    expect(analyses[0]!.regression.r2).toBeGreaterThan(0.95)
  })
})
