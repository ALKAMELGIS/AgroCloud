import { describe, expect, it } from 'vitest'
import {
  buildVegetationCoverageComparison,
  buildVegetationCoverageFromHistogram,
  buildVegetationCoverageInsights,
  buildVegetationCoverageTrend,
} from './vegetationCoverageEngine'
import type { LayerClassAreaResult } from './siLayerClassAreaEngine'

const sampleGeometry: GeoJSON.Polygon = {
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
}

function mockHistogram(counts: number[]): LayerClassAreaResult {
  const rows = counts.map((count, classIndex) => ({
    classIndex,
    count,
    areaM2: count * 100,
    areaHa: (count * 100) / 10_000,
    areaKm2: (count * 100) / 1_000_000,
    pctOfAoi: 0,
  }))
  const totalCount = counts.reduce((s, c) => s + c, 0)
  for (const row of rows) {
    row.pctOfAoi = totalCount > 0 ? (row.count / totalCount) * 100 : 0
  }
  return {
    rows,
    aoiAreaM2: totalCount * 100,
    analyzedAreaM2: totalCount * 100,
    sampleCount: totalCount,
    sceneDate: '2026-07-06',
  }
}

describe('vegetationCoverageEngine', () => {
  it('maps NDVI histogram bins to coverage classes', () => {
    const histogram = mockHistogram([0, 0, 100, 200, 300, 400, 500, 600, 700, 800])
    const summary = buildVegetationCoverageFromHistogram(histogram, sampleGeometry, '2026-07-06')
    expect(summary.fromHistogram).toBe(true)
    expect(summary.vegetationCoveragePct).toBeGreaterThan(50)
    expect(summary.classes.find(c => c.id === 'dense')?.areaHa).toBeGreaterThan(0)
  })

  it('builds trend points from NDVI series', () => {
    const trend = buildVegetationCoverageTrend(
      ['2026-06-01', '2026-07-01'],
      [0.25, 0.45],
      10,
    )
    expect(trend).toHaveLength(2)
    expect(trend[1]!.coveragePct).toBeGreaterThan(trend[0]!.coveragePct)
  })

  it('compares two coverage summaries', () => {
    const a = buildVegetationCoverageFromHistogram(
      mockHistogram([0, 0, 500, 500, 500, 500, 500, 500, 500, 500]),
      sampleGeometry,
      '2026-06-01',
    )
    const b = buildVegetationCoverageFromHistogram(
      mockHistogram([0, 0, 100, 100, 100, 100, 800, 800, 800, 800]),
      sampleGeometry,
      '2026-07-01',
    )
    const comparison = buildVegetationCoverageComparison([a, b])
    expect(comparison).not.toBeNull()
    expect(comparison!.rows).toHaveLength(2)
  })

  it('generates narrative insights', () => {
    const summary = buildVegetationCoverageFromHistogram(
      mockHistogram([0, 0, 100, 200, 300, 400, 500, 600, 700, 800]),
      sampleGeometry,
      '2026-07-06',
    )
    const insights = buildVegetationCoverageInsights(summary)
    expect(insights.narrative.length).toBeGreaterThan(0)
    expect(insights.recommendations.length).toBeGreaterThan(0)
  })
})
