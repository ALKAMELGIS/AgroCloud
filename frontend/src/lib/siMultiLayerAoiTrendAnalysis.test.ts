import { describe, expect, it } from 'vitest'
import {
  buildMultiLayerAoiTrendChartSeries,
  buildMultiLayerAoiTrendResult,
  getCachedMultiLayerAoiTrendResult,
  pickDailyRowForScene,
  resolveMultiLayerAoiIndexStats,
} from './siMultiLayerAoiTrendAnalysis'
import type { CropAlertFieldInput } from './siCropAlertEngine'

const fieldA: CropAlertFieldInput = {
  fieldKey: 'a1',
  objectId: '1',
  farmName: 'Field A',
  farmCode: '',
  structureType: 'Field',
  country: '',
  city: '',
  centroid: [46.6, 24.7],
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [46.6, 24.7],
        [46.61, 24.7],
        [46.61, 24.71],
        [46.6, 24.71],
        [46.6, 24.7],
      ],
    ],
  },
}

describe('siMultiLayerAoiTrendAnalysis', () => {
  it('resolves zonal stats for NDVI', () => {
    const stats = resolveMultiLayerAoiIndexStats('NDVI', {
      date: '2024-06-01',
      ndvi: 0.72,
      ndmi: null,
      ndwi: null,
      evi: null,
      savi: null,
      ciRe: null,
      zonal: { ndvi: { min: 0.55, max: 0.88, mean: 0.72 }, ndmi: { min: 0, max: 0, mean: 0 }, ndwi: { min: 0, max: 0, mean: 0 }, evi: { min: 0, max: 0, mean: 0 } },
    })
    expect(stats.mean).toBe(0.72)
    expect(stats.min).toBe(0.55)
    expect(stats.max).toBe(0.88)
    expect(stats.median).toBeCloseTo(0.7175, 3)
  })

  it('builds chart series with AOIs on X-axis and indices as lines', () => {
    const row = {
      date: '2024-06-01',
      ndvi: 0.6,
      ndmi: 0.2,
      ndwi: 0.1,
      evi: 0.55,
      savi: 0.58,
      ciRe: null,
    }
    const results = [
      getCachedMultiLayerAoiTrendResult(fieldA, '2024-06-01', ['NDVI'], row),
      getCachedMultiLayerAoiTrendResult(
        { ...fieldA, fieldKey: 'b1', farmName: 'Field B' },
        '2024-06-01',
        ['NDVI'],
        { ...row, ndvi: 0.8 },
      ),
    ]
    const chart = buildMultiLayerAoiTrendChartSeries(results, ['NDVI'])
    expect(chart.aoiLabels).toEqual(['Field A', 'Field B'])
    expect(chart.layerSeries[0]?.values).toEqual([0.6, 0.8])

    const rowWithZonal = {
      date: '2024-06-01',
      ndvi: 0.72,
      ndmi: null,
      ndwi: null,
      evi: null,
      savi: null,
      ciRe: null,
      zonal: {
        ndvi: { min: 0.55, max: 0.88, mean: 0.72 },
        ndmi: { min: 0, max: 0, mean: 0 },
        ndwi: { min: 0, max: 0, mean: 0 },
        evi: { min: 0, max: 0, mean: 0 },
      },
    }
    const zonalResults = [
      buildMultiLayerAoiTrendResult(fieldA, '2024-06-01', ['NDVI'], rowWithZonal),
    ]
    expect(buildMultiLayerAoiTrendChartSeries(zonalResults, ['NDVI'], 'min').layerSeries[0]?.values).toEqual([
      0.55,
    ])
    expect(buildMultiLayerAoiTrendChartSeries(zonalResults, ['NDVI'], 'max').layerSeries[0]?.values).toEqual([
      0.88,
    ])
  })

  it('pickDailyRowForScene prefers nearest scene with index data', () => {
    const rows = [
      { date: '2026-07-05', ndvi: 0.55, ndmi: 0.2, ndwi: 0.1, evi: 0.5, savi: 0.52, ciRe: null },
      { date: '2026-07-09', ndvi: 0.62, ndmi: 0.22, ndwi: 0.11, evi: 0.51, savi: 0.53, ciRe: null },
    ]
    const picked = pickDailyRowForScene(rows, '2026-07-11', ['NDVI'])
    expect(picked?.date).toBe('2026-07-09')
    expect(picked?.ndvi).toBe(0.62)
  })
})
