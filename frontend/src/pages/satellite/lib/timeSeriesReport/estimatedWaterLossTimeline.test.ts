import { describe, expect, it } from 'vitest'
import {
  buildEstimatedWaterLossTimeline,
  classifyWaterStressLevel,
  computeEstimatedWaterLossPoint,
  computeMoistureScore,
  computeWaterLossIndexFraction,
  estimatedWaterLossSeriesForChart,
  WATER_LOSS_INDEX_ET_REF_MM,
} from './estimatedWaterLossTimeline'

describe('estimatedWaterLossTimeline', () => {
  it('computes moisture score and water loss index from NDMI/NDWI', () => {
    expect(computeMoistureScore(0.2, 0.1)).toBeCloseTo(0.16, 4)
    expect(computeWaterLossIndexFraction(0.2, 0.1)).toBeCloseTo(0.84, 4)
    expect(classifyWaterStressLevel(84)).toBe('Critical')
    expect(classifyWaterStressLevel(65)).toBe('High')
    expect(classifyWaterStressLevel(45)).toBe('Moderate')
    expect(classifyWaterStressLevel(20)).toBe('Low')
  })

  it('estimates water loss from satellite indices when ET is unavailable', () => {
    const point = computeEstimatedWaterLossPoint({
      date: '2026-07-05',
      aoiAreaHa: 100,
      ndmi: 0.1,
      ndwi: 0.05,
      ndvi: 0.55,
      vegetationCoveragePct: 70,
      vegetationAreaHa: 70,
    })
    expect(point).toBeTruthy()
    expect(point!.source).toBe('satellite-index')
    expect(point!.waterLossIndexPct).toBeGreaterThan(0)
    expect(point!.waterLossIndexPct).toBeLessThan(100)
    expect(point!.etMmDay).toBeGreaterThan(0)
    expect(point!.waterLossM3Day).toBeGreaterThan(0)
    expect(point!.ndmi).toBe(0.1)
    expect(point!.ndwi).toBe(0.05)
    expect(point!.vegetationCoveragePct).toBe(70)
  })

  it('varies ET between winter and summer for the same moisture', () => {
    const summer = computeEstimatedWaterLossPoint({
      date: '2025-07-20',
      aoiAreaHa: 10,
      ndmi: 0.05,
      ndwi: 0,
      ndvi: 0.55,
    })
    const winter = computeEstimatedWaterLossPoint({
      date: '2025-01-20',
      aoiAreaHa: 10,
      ndmi: 0.05,
      ndwi: 0,
      ndvi: 0.55,
    })
    expect(summer!.etMmDay!).toBeGreaterThan(winter!.etMmDay!)
  })

  it('uses ET deficit when ETa and ETc are available', () => {
    const point = computeEstimatedWaterLossPoint({
      date: '2026-07-05',
      aoiAreaHa: 50,
      ndmi: 0.3,
      ndwi: 0.2,
      etMmDay: 4.5,
      etcMmDay: 5,
    })
    expect(point).toBeTruthy()
    expect(point!.source).toBe('et')
    expect(point!.waterLossIndexPct).toBeCloseTo(10, 0)
    expect(point!.waterLossM3Day).toBeCloseTo(0.5 * 50 * 10, 2)
    expect(point!.waterLossM3HaDay).toBeCloseTo(5, 2)
    expect(point!.etMmDay).toBe(4.5)
  })

  it('matches user ET deficit example (ETa=4, ETc=5 → 20%)', () => {
    const point = computeEstimatedWaterLossPoint({
      date: '2026-07-05',
      aoiAreaHa: 100,
      ndmi: null,
      ndwi: null,
      etMmDay: 4,
      etcMmDay: 5,
    })
    expect(point).toBeTruthy()
    expect(point!.waterLossIndexPct).toBeCloseTo(20, 0)
    expect(point!.waterLossM3HaDay).toBeCloseTo(10, 0)
    expect(point!.waterLossM3Day).toBeCloseTo(1000, 0)
  })

  it('estimates NDWI from NDMI when NDWI is missing', () => {
    const point = computeEstimatedWaterLossPoint({
      date: '2026-07-05',
      aoiAreaHa: 10,
      ndmi: 0.2,
      ndwi: null,
    })
    expect(point).toBeTruthy()
    expect(point!.ndwiEstimated).toBe(true)
    expect(point!.ndwi).not.toBeNull()
  })

  it('builds timeline from daily rows and assigns trends', () => {
    const timeline = buildEstimatedWaterLossTimeline({
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [55.0, 25.0],
            [55.01, 25.0],
            [55.01, 25.01],
            [55.0, 25.01],
            [55.0, 25.0],
          ],
        ],
      },
      chartLabels: ['2026-W01', '2026-W02'],
      displayLabels: ['W01', 'W02'],
      periodAnchorDates: { '2026-W01': '2026-01-05', '2026-W02': '2026-01-12' },
      dailyRows: [
        { date: '2026-01-05', ndvi: 0.4, ndwi: 0.05, ndmi: 0.08, evi: null, savi: null, ciRe: null },
        { date: '2026-01-12', ndvi: 0.35, ndwi: -0.05, ndmi: -0.1, evi: null, savi: null, ciRe: null },
      ],
      layerSeries: [
        { layerId: 'NDMI', values: [0.08, -0.1] },
        { layerId: 'NDWI', values: [0.05, -0.05] },
      ],
      vegetationCoverageTimeline: [
        {
          date: '2026-01-05',
          periodLabel: 'W01',
          ndviMean: 0.4,
          ndviMin: 0.3,
          ndviMax: 0.5,
          vegetationCoveragePct: 72,
          vegetationAreaHa: 80,
          vegetationAreaM2: 800000,
          bareCoveragePct: 28,
          bareAreaHa: 30,
          aoiAreaHa: 110,
          aoiAreaM2: 1_100_000,
          dominantClass: 'Moderate',
          dominantTier: 'moderate',
          classes: [],
          source: 'mean-estimate',
          trend: 'Stable',
        },
      ],
    })
    expect(timeline.length).toBe(2)
    expect(timeline[0]!.vegetationCoveragePct).toBe(72)
    expect(timeline[0]!.trend).toBe('Stable')
    expect(timeline[1]!.waterLossIndexPct).toBeGreaterThan(timeline[0]!.waterLossIndexPct)
    expect(['Increasing', 'Stable', 'Decreasing']).toContain(timeline[1]!.trend)
  })

  it('maps water loss series onto chart period keys', () => {
    const series = estimatedWaterLossSeriesForChart(
      ['2026-W01', '2026-W02'],
      { '2026-W01': '2026-01-05', '2026-W02': '2026-01-12' },
      [
        {
          date: '2026-01-05',
          periodLabel: 'W01',
          moistureScore: 0.2,
          waterLossIndexPct: 80,
          etMmDay: 4.8,
          waterLossM3Day: 4800,
          waterLossM3HaDay: 48,
          ndmi: 0.1,
          ndwi: 0.05,
          ndwiEstimated: false,
          vegetationCoveragePct: 70,
          vegetationAreaHa: 70,
          aoiAreaHa: 100,
          waterStressLevel: 'Critical',
          source: 'satellite-index',
          highWaterLoss: true,
          trend: 'Stable',
        },
      ],
    )
    expect(series[0]).toBe(4800)
    expect(series[1]).toBeNull()
  })
})
