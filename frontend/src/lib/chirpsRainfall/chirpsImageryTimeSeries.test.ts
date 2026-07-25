import { describe, expect, it } from 'vitest'
import {
  chirpsPointsToChartSeries,
  mergeOpticalAndChirpsChart,
  partitionImageryTimeSeriesLayerIds,
} from './chirpsImageryTimeSeries'
import { aggregateImageryChartByTimePeriod } from '../../pages/dashboards/agroCloudPlatform/acpImageryTimeSeries'

describe('chirpsImageryTimeSeries', () => {
  it('partitions PRECIP from optical layer ids', () => {
    expect(partitionImageryTimeSeriesLayerIds(['NDVI', 'PRECIP', 'CHIRPS'])).toEqual({
      precipLayerIds: ['PRECIP'],
      opticalLayerIds: ['NDVI'],
    })
  })

  it('builds a chart series from CHIRPS points', () => {
    const chart = chirpsPointsToChartSeries([
      { date: '2024-01-02', rainfallMm: 1.5 },
      { date: '2024-01-01', rainfallMm: 0.2 },
      { date: '2024-01-03', rainfallMm: null },
    ])
    expect(chart.labels).toEqual(['2024-01-01', '2024-01-02'])
    expect(chart.series[0]?.layerId).toBe('PRECIP')
    expect(chart.series[0]?.values).toEqual([0.2, 1.5])
  })

  it('merges PRECIP onto optical observation dates (union axis)', () => {
    const merged = mergeOpticalAndChirpsChart({
      layerIds: ['NDVI', 'PRECIP'],
      opticalLabels: ['2024-01-01', '2024-01-05'],
      opticalSeries: [{ layerId: 'NDVI', values: [0.4, 0.5] }],
      chirpsPoints: [
        { date: '2024-01-01', rainfallMm: 2 },
        { date: '2024-01-03', rainfallMm: 8 },
        { date: '2024-01-05', rainfallMm: 1 },
      ],
    })
    expect(merged.labels).toEqual(['2024-01-01', '2024-01-03', '2024-01-05'])
    expect(merged.series.map(s => s.layerId)).toEqual(['NDVI', 'PRECIP'])
    expect(merged.series[0]?.values[0]).toBe(0.4)
    expect(Number.isNaN(merged.series[0]?.values[1] as number)).toBe(true)
    expect(merged.series[1]?.values).toEqual([2, 8, 1])
  })

  it('sums PRECIP when aggregating to monthly periods', () => {
    const agg = aggregateImageryChartByTimePeriod(
      ['2024-01-01', '2024-01-02', '2024-02-01'],
      [{ layerId: 'PRECIP', values: [1, 3, 5] }],
      'month',
    )
    expect(agg.labels).toEqual(['2024-01', '2024-02'])
    expect(agg.series[0]?.values).toEqual([4, 5])
  })
})
