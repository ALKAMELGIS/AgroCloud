import { describe, expect, it } from 'vitest'
import {
  DEPTH_LABELS,
  RISK_LABELS,
  depthBucketFromRelative,
  distanceTransformClasses,
} from './sarFloodReportDerived'
import {
  buildSarFloodExecutiveSummary,
  sarFloodRecommendations,
} from './sarFloodReportExecutive'
import type { FloodMonitoringResult } from '../floodMonitoringPipeline'

function sampleResult(overrides?: Partial<FloodMonitoringResult['stats']>): FloodMonitoringResult {
  return {
    bounds: [32.9, 13.0, 33.1, 13.2],
    flood: { url: 'data:image/png;base64,AA==', bounds: [32.9, 13.0, 33.1, 13.2] },
    change: { url: 'data:image/png;base64,AA==', bounds: [32.9, 13.0, 33.1, 13.2] },
    vector: { type: 'FeatureCollection', features: [] },
    stats: {
      aoiHa: 100,
      floodedHa: 25,
      pctInundated: 25,
      preWaterHa: 5,
      postWaterHa: 30,
      mode: 'change-detection',
      thresholdDb: -17,
      preDate: '2024-01-01',
      postDate: '2024-01-15',
      resolution: '256×256px',
      ...overrides,
    },
    classStats: [
      { name: 'New flooding', color: '#ef4444', pct: 20, areaHa: 20 },
      { name: 'Persistent water', color: '#2563eb', pct: 5, areaHa: 5 },
      { name: 'Receded water', color: '#22d3ee', pct: 2, areaHa: 2 },
      { name: 'Dry land', color: '#64748b', pct: 73, areaHa: 73 },
    ],
  }
}

describe('depthBucketFromRelative', () => {
  it('maps relative scores into five depth classes', () => {
    expect(depthBucketFromRelative(0)).toBe(1)
    expect(depthBucketFromRelative(0.2)).toBe(2)
    expect(depthBucketFromRelative(0.5)).toBe(3)
    expect(depthBucketFromRelative(0.7)).toBe(4)
    expect(depthBucketFromRelative(0.9)).toBe(5)
    expect(DEPTH_LABELS).toHaveLength(5)
    expect(RISK_LABELS).toHaveLength(5)
  })
})

describe('distanceTransformClasses', () => {
  it('assigns higher class deeper into a flooded block', () => {
    const w = 7
    const h = 7
    const flooded = new Uint8Array(w * h)
    for (let y = 1; y < 6; y += 1) {
      for (let x = 1; x < 6; x += 1) flooded[y * w + x] = 1
    }
    const { classes, maxDist } = distanceTransformClasses(flooded, w, h)
    expect(maxDist).toBeGreaterThan(0)
    const center = classes[3 * w + 3]!
    const edge = classes[1 * w + 1]!
    expect(center).toBeGreaterThanOrEqual(edge)
    expect(center).toBeGreaterThanOrEqual(1)
  })
})

describe('buildSarFloodExecutiveSummary', () => {
  it('embeds inundation metrics in narrative', () => {
    const exec = buildSarFloodExecutiveSummary({
      aoiName: 'Test Basin',
      areaHa: 100,
      result: sampleResult(),
      depthStats: [{ label: 'Deep', value: '12% of inundated area' }],
      riskStats: [{ label: 'High', value: '8% of inundated area' }],
    })
    expect(exec.projectOverview).toContain('Test Basin')
    expect(exec.inundationSummary).toContain('25.00 ha')
    expect(exec.narrative.length).toBeGreaterThan(100)
  })
})

describe('sarFloodRecommendations', () => {
  it('escalates when inundation is high', () => {
    const recs = sarFloodRecommendations(sampleResult({ pctInundated: 40, floodedHa: 40 }))
    expect(recs[0]).toMatch(/High inundation/i)
  })

  it('suggests baseline when single-date', () => {
    const recs = sarFloodRecommendations(
      sampleResult({ mode: 'single-date', pctInundated: 10, preDate: null }),
    )
    expect(recs.some(r => /pre-event baseline/i.test(r))).toBe(true)
  })
})
