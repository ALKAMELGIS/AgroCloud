import { describe, expect, it } from 'vitest'
import type { CropAlertFieldInput } from './siCropAlertEngine'
import type { SentinelHubDailyIndexMeans } from './sentinelHubStatisticsApi'
import { buildMultiAoiTimelineResult } from './siMultiAoiTimeline'

const poly: GeoJSON.Polygon = {
  type: 'Polygon',
  coordinates: [
    [
      [55, 24],
      [55.01, 24],
      [55.01, 24.01],
      [55, 24.01],
      [55, 24],
    ],
  ],
}

function field(id: string, name: string): CropAlertFieldInput {
  return {
    fieldKey: id,
    objectId: id,
    farmName: name,
    farmCode: '',
    structureType: 'Field',
    country: '',
    city: '',
    centroid: [55, 24],
    geometry: poly,
  }
}

function daily(date: string, ndvi: number, ndmi: number): SentinelHubDailyIndexMeans {
  return {
    date,
    ndvi,
    ndwi: null,
    ndmi,
    evi: null,
    savi: null,
    ciRe: null,
  }
}

describe('siMultiAoiTimeline', () => {
  it('builds a Single-Layer-Trend style timeline for one plot and multiple layers', () => {
    const result = buildMultiAoiTimelineResult({
      plots: [field('P1', 'Potato_Plots #1')],
      layerIds: ['NDVI', 'NDMI'],
      fromDate: '2026-03-01',
      toDate: '2026-07-27',
      timeAggregation: 'day',
      dailyByFieldKey: new Map([
        [
          'P1',
          [
            daily('2026-03-04', 0.2, -0.3),
            daily('2026-04-08', 0.25, -0.2),
            daily('2026-06-12', 0.8, 0.3),
          ],
        ],
      ]),
    })
    expect(result.labels).toEqual(['2026-03-04', '2026-04-08', '2026-06-12'])
    expect(result.series.map(s => s.label)).toEqual(['NDVI', 'NDMI'])
    expect(result.series[0]?.values[2]).toBeCloseTo(0.8)
    expect(result.series[1]?.values[2]).toBeCloseTo(0.3)
  })
})
