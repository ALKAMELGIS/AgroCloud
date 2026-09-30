import { describe, expect, it } from 'vitest'
import { computeChas, chasInputsFromSnapshot } from './siCropAlertDchasBeacon'
import { deriveCoherentIndicesFromNdvi, type CropAlertFieldResult } from './siCropAlertEngine'
import { DCHAS_TIER_FARMER_ACTIONS, resolveFarmerFieldAction } from './farmerAlertAction'
import { VEGETATION_ALERT_ACTIONS } from './vegetationAlertDecision'

function testSnapshot(ndvi: number, ndmi: number, ndwi: number) {
  const derived = deriveCoherentIndicesFromNdvi(ndvi, 'f1', '2026-06-10')
  return { ndvi, ndmi, ndwi, evi: derived.evi, ciRe: derived.ciRe }
}

function baseResult(overrides: Partial<CropAlertFieldResult> = {}): CropAlertFieldResult {
  const current = testSnapshot(0.81, 0.42, 0.25)
  const previous7 = testSnapshot(0.78, 0.4, 0.24)
  const chasCurrent = computeChas(chasInputsFromSnapshot(current))
  const chasPrevious = computeChas(chasInputsFromSnapshot(previous7))
  return {
    fieldKey: 'f1',
    objectId: '1349',
    farmName: 'Plot A',
    farmCode: 'P-A',
    structureType: 'pivot',
    centroid: [55.1, 25.2],
    current,
    previous7,
    previous30: testSnapshot(0.72, 0.38, 0.22),
    deltaPct: { ndvi: 2, ndwi: 1, ndmi: 1 },
    trend: 'stable',
    seasonalPeakNdvi: 0.82,
    status: 'healthy',
    severity: 'normal',
    alertTypes: [],
    title: 'Stable canopy',
    message: 'Crop vigor is stable.',
    evaluatedAt: '2026-06-10T10:00:00Z',
    imageDate: '2026-06-10',
    requestedDate: '2026-06-10',
    usedDate: '2026-06-10',
    analysisDate: '2026-06-10',
    dataSource: 'Sentinel Live',
    dataQuality: 'verified',
    dataWarning: null,
    dataReason: null,
    liveVerified: true,
    ndviMean3: 0.8,
    ndviSceneDates: ['2026-06-10', '2026-06-03', '2026-05-27'],
    ndviSceneValues: [0.81, 0.8, 0.8],
    ndmiSceneValues: [0.42, 0.4, 0.39],
    ndwiSceneValues: [0.24, 0.22, 0.21],
    ndviChangePct2: 1,
    ndviTrendLabel: 'Latest scene only',
    alertReasonLines: [],
    alertExplanation: null,
    chasCurrent,
    chasPrevious,
    deltaChas: Number((chasCurrent - chasPrevious).toFixed(4)),
    ...overrides,
  }
}

describe('resolveFarmerFieldAction', () => {
  it('returns waiting copy when result is missing', () => {
    expect(resolveFarmerFieldAction(null, 'watch')).toBe('Waiting for Layer Live analysis…')
  })

  it('prioritizes vegetation water-stress action', () => {
    const result = baseResult({
      current: testSnapshot(0.55, 0.12, 0.1),
      previous7: testSnapshot(0.58, 0.14, 0.12),
    })
    expect(resolveFarmerFieldAction(result, 'watch')).toBe(VEGETATION_ALERT_ACTIONS.waterStress)
  })

  it('returns ΔCHAS critical guidance for critical tier', () => {
    const result = baseResult({ deltaChas: -0.2, chasCurrent: 0.35, chasPrevious: 0.55 })
    expect(resolveFarmerFieldAction(result, 'critical')).toBe(DCHAS_TIER_FARMER_ACTIONS.critical)
  })

  it('returns watch guidance for watch tier', () => {
    const result = baseResult({ deltaChas: -0.02 })
    expect(resolveFarmerFieldAction(result, 'watch')).toBe(DCHAS_TIER_FARMER_ACTIONS.watch)
  })

  it('returns healthy monitoring copy for stable tier', () => {
    const result = baseResult({ deltaChas: 0.01 })
    expect(resolveFarmerFieldAction(result, 'stable')).toContain('continue routine monitoring')
  })
})
