import { describe, expect, it } from 'vitest'
import {
  buildEstimatedYieldTimeline,
  classifyYieldFactor,
  latestEstimatedYieldSummary,
} from './estimatedYieldTimeline'

describe('estimatedYieldTimeline', () => {
  const geometry: GeoJSON.Polygon = {
    type: 'Polygon',
    coordinates: [
      [
        [46.0, 24.0],
        [46.02, 24.0],
        [46.02, 24.015],
        [46.0, 24.015],
        [46.0, 24.0],
      ],
    ],
  }

  it('builds per-date yield rows with the potato composite formula', () => {
    const timeline = buildEstimatedYieldTimeline({
      geometry,
      chartLabels: ['2026-07-01', '2026-07-15'],
      displayLabels: ['2026-07-01', '2026-07-15'],
      dailyRows: [
        {
          date: '2026-07-01',
          ndvi: 0.82,
          ndwi: null,
          ndmi: 0.41,
          evi: null,
          savi: null,
          ciRe: null,
          ndre: 0.56,
        },
        {
          date: '2026-07-15',
          ndvi: 0.7,
          ndwi: null,
          ndmi: 0.35,
          evi: null,
          savi: null,
          ciRe: null,
          ndre: 0.5,
        },
      ],
      layerSeries: [],
      maxYieldTHa: 55,
      cropLabel: 'Potato',
    })

    expect(timeline).toHaveLength(2)
    expect(timeline[0]!.yieldFactor).toBeCloseTo(0.645, 3)
    expect(timeline[0]!.estimatedYieldTHa).toBeCloseTo(35.48, 1)
    expect(timeline[0]!.interpretation).toContain('Yield Factor')
    expect(timeline[0]!.recommendations.length).toBeGreaterThan(10)
    expect(classifyYieldFactor(0.645)).toBe('Good')

    const latest = latestEstimatedYieldSummary(timeline)
    expect(latest?.date).toBe('2026-07-15')
  })

  it('skips dates missing NDVI/NDMI/NDRE', () => {
    const timeline = buildEstimatedYieldTimeline({
      geometry,
      chartLabels: ['2026-07-01'],
      displayLabels: ['2026-07-01'],
      dailyRows: [
        {
          date: '2026-07-01',
          ndvi: 0.5,
          ndwi: null,
          ndmi: null,
          evi: null,
          savi: null,
          ciRe: null,
          ndre: null,
        },
      ],
      layerSeries: [],
    })
    expect(timeline).toHaveLength(0)
  })
})
