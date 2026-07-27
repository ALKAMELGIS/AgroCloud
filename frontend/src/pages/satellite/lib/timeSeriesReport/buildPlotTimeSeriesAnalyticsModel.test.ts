import { describe, expect, it } from 'vitest'
import type { CropAlertFieldInput } from '../../../../lib/siCropAlertEngine'
import type { SentinelHubDailyIndexMeans } from '../../../../lib/sentinelHubStatisticsApi'
import {
  aggregateObservations,
  buildPlotAnalyticsRow,
  buildPlotTimeSeriesAnalyticsModel,
  computeTrend,
  sortPlotAnalyticsRows,
} from './buildPlotTimeSeriesAnalyticsModel'

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

function daily(date: string, ndvi: number | null): SentinelHubDailyIndexMeans {
  return {
    date,
    ndvi,
    ndwi: null,
    ndmi: null,
    evi: null,
    savi: null,
    ciRe: null,
  }
}

describe('buildPlotTimeSeriesAnalyticsModel', () => {
  it('computes trend from slope', () => {
    expect(computeTrend([0.2, 0.3, 0.4, 0.5])).toBe('Increasing')
    expect(computeTrend([0.5, 0.4, 0.3, 0.2])).toBe('Decreasing')
    expect(computeTrend([0.4, 0.4, 0.4])).toBe('Stable')
  })

  it('aggregates daily values to monthly means', () => {
    const obs = aggregateObservations(
      [
        { date: '2026-04-01', value: 0.4 },
        { date: '2026-04-15', value: 0.6 },
        { date: '2026-05-01', value: 0.5 },
      ],
      'month',
    )
    expect(obs).toHaveLength(2)
    expect(obs[0]?.date).toBe('2026-04')
    expect(obs[0]?.value).toBeCloseTo(0.5)
  })

  it('builds priority rows sorted by priority score (worst first)', () => {
    const low = field('P-low', 'Low Plot')
    const high = field('P-high', 'High Plot')
    const model = buildPlotTimeSeriesAnalyticsModel({
      plots: [high, low],
      layerId: 'NDVI',
      dailyByFieldKey: new Map([
        ['P-low', [daily('2026-07-01', 0.12), daily('2026-07-10', 0.1)]],
        ['P-high', [daily('2026-07-01', 0.7), daily('2026-07-10', 0.72)]],
      ]),
      fromDate: '2026-07-01',
      toDate: '2026-07-20',
      timeAggregation: 'day',
      farmName: 'Demo Farm',
      sortField: 'priority',
    })
    expect(model.rows[0]?.plotId).toBe('P-low')
    expect(model.rows[0]!.priorityScore).toBeGreaterThan(model.rows[1]!.priorityScore)
    expect(model.kpis.criticalCount + model.kpis.stressCount).toBeGreaterThan(0)
    expect(model.alerts.length).toBeGreaterThan(0)
  })

  it('sorts by latest value ascending', () => {
    const a = buildPlotAnalyticsRow({
      field: field('A', 'A'),
      layerId: 'NDVI',
      dailyRows: [daily('2026-07-01', 0.5), daily('2026-07-10', 0.55)],
      timeAggregation: 'day',
    })
    const b = buildPlotAnalyticsRow({
      field: field('B', 'B'),
      layerId: 'NDVI',
      dailyRows: [daily('2026-07-01', 0.2), daily('2026-07-10', 0.18)],
      timeAggregation: 'day',
    })
    const sorted = sortPlotAnalyticsRows([a, b], 'value-asc')
    expect(sorted[0]?.plotId).toBe('B')
  })
})
