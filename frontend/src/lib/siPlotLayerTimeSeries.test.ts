import { describe, expect, it } from 'vitest'
import type { CropAlertFieldInput } from './siCropAlertEngine'
import type { SentinelHubDailyIndexMeans } from './sentinelHubStatisticsApi'
import { buildPlotLayerTimeSeriesResult } from './siPlotLayerTimeSeries'

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

function daily(date: string, ndmi: number): SentinelHubDailyIndexMeans {
  return {
    date,
    ndvi: null,
    ndwi: null,
    ndmi,
    evi: null,
    savi: null,
    ciRe: null,
  }
}

describe('siPlotLayerTimeSeries', () => {
  it('builds weekly multi-plot series aligned on shared calendar weeks', () => {
    const result = buildPlotLayerTimeSeriesResult({
      plots: [field('P-01', 'P-01'), field('P-02', 'P-02')],
      layerId: 'NDMI',
      fromDate: '2025-01-01',
      toDate: '2025-02-28',
      timeAggregation: 'week',
      dailyByFieldKey: new Map([
        [
          'P-01',
          [
            daily('2025-01-06', 0.1),
            daily('2025-01-08', 0.2),
            daily('2025-01-20', 0.3),
          ],
        ],
        [
          'P-02',
          [
            daily('2025-01-07', -0.1),
            daily('2025-01-21', 0.05),
          ],
        ],
      ]),
    })
    expect(result.layerId).toBe('NDMI')
    expect(result.series).toHaveLength(2)
    // Full week spine Jan–Feb (~9 weeks), not only observed weeks.
    expect(result.labels.length).toBeGreaterThanOrEqual(8)
    expect(result.series[0]?.values).toHaveLength(result.labels.length)
    expect(result.series[1]?.values).toHaveLength(result.labels.length)
    // Same x index → both plots share identical period keys.
    expect(result.series.every(s => s.values.length === result.labels.length)).toBe(true)
    expect(result.series.some(s => s.observationCount > 0)).toBe(true)

    const monthly = buildPlotLayerTimeSeriesResult({
      plots: [field('P-01', 'P-01'), field('P-02', 'P-02')],
      layerId: 'NDMI',
      fromDate: '2025-01-01',
      toDate: '2025-02-28',
      timeAggregation: 'month',
      dailyByFieldKey: result.dailyByFieldKey!,
    })
    expect(monthly.labels).toEqual(['2025-01', '2025-02'])
    expect(monthly.series[0]?.values).toHaveLength(2)
    expect(monthly.series[1]?.values).toHaveLength(2)
  })

  it('aligns daily values on shared dates and averages duplicate same-day rows', () => {
    const result = buildPlotLayerTimeSeriesResult({
      plots: [field('P-01', 'P-01'), field('P-02', 'P-02')],
      layerId: 'NDMI',
      fromDate: '2025-01-01',
      toDate: '2025-01-31',
      timeAggregation: 'day',
      dailyByFieldKey: new Map([
        [
          'P-01',
          [
            daily('2025-01-06', 0.10),
            daily('2025-01-06', 0.20), // duplicate → mean 0.15
            daily('2025-01-20', 0.30),
            daily('2024-12-20', 0.99), // outside range — ignored
          ],
        ],
        [
          'P-02',
          [daily('2025-01-06', -0.10), daily('2025-01-21', 0.05)],
        ],
      ]),
    })
    expect(result.labels).toEqual(['2025-01-06', '2025-01-20', '2025-01-21'])
    const p1 = result.series.find(s => s.fieldKey === 'P-01')!
    const p2 = result.series.find(s => s.fieldKey === 'P-02')!
    expect(p1.values[0]).toBeCloseTo(0.15, 10)
    expect(p1.values[1]).toBe(0.3)
    expect(p1.values[2]).toBeNull()
    expect(p2.values).toEqual([-0.1, null, 0.05])
  })
})
