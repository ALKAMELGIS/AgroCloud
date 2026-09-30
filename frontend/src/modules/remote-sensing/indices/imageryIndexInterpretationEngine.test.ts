import { describe, expect, it } from 'vitest'
import {
  buildImageryIndexInterpretation,
  resolveIndexThresholdProfile,
} from './imageryIndexInterpretationEngine'

describe('imageryIndexInterpretationEngine', () => {
  it('classifies NDVI mean into healthy tier with coverage line', () => {
    const result = buildImageryIndexInterpretation({
      layerId: 'NDVI',
      sceneDate: '2024-06-15',
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
      dailyRows: [
        {
          date: '2024-06-15',
          ndvi: 0.74,
          ndwi: null,
          ndmi: null,
          evi: null,
          savi: null,
          ciRe: null,
          zonal: { ndvi: { min: 0.55, max: 0.82, mean: 0.74 }, ndmi: { min: 0, max: 0, mean: 0 }, ndwi: { min: 0, max: 0, mean: 0 }, evi: { min: 0, max: 0, mean: 0 } },
        },
      ],
      chartLabels: ['2024-06-15'],
      chartValues: [0.74],
    })
    expect(result).not.toBeNull()
    expect(result!.meanTier).toBe('healthy')
    expect(result!.summaryLine).toContain('0.74')
    expect(result!.lines.length).toBeGreaterThanOrEqual(2)
  })

  it('uses distinct NDWI thresholds', () => {
    const profile = resolveIndexThresholdProfile('NDWI')
    expect(profile.id).toBe('NDWI')
    const result = buildImageryIndexInterpretation({
      layerId: 'NDWI',
      sceneDate: '2024-06-15',
      geometry: null,
      dailyRows: [],
      chartLabels: ['2024-06-15'],
      chartValues: [0.21],
    })
    expect(result!.meanTier).toBe('moderate')
    expect(result!.summaryLine).toContain('NDWI')
  })
})
