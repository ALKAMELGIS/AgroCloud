import { describe, expect, it } from 'vitest'
import type { CropAlertFieldResult } from './siCropAlertEngine'
import {
  classifyCdsiInsightTier,
  DCHAS_DELTA_CRITICAL,
  DCHAS_DELTA_STRESS,
  DCHAS_ORB_BLINK_MS,
  DCHAS_RISK_COLORS,
  classifyDchasRiskTier,
  computeChas,
  computeDeltaChas,
  resolveDchasOrbPresentation,
} from './siCropAlertDchasBeacon'

const baseResult = (overrides: Partial<CropAlertFieldResult> = {}): CropAlertFieldResult =>
  ({
    fieldKey: 'f1',
    objectId: '1',
    farmName: 'Test',
    farmCode: 'T1',
    structureType: 'Pivot',
    centroid: [0, 0],
    current: { ndvi: 0.55, ndmi: 0.2, ndwi: 0.12, evi: 0.5 },
    previous7: { ndvi: 0.62, ndmi: 0.22, ndwi: 0.14, evi: 0.52 },
    previous30: { ndvi: 0.5, ndmi: 0.18, ndwi: 0.1, evi: 0.48 },
    deltaPct: { ndvi: -5, ndwi: -2, ndmi: -3 },
    trend: 'decreasing',
    seasonalPeakNdvi: 0.7,
    status: 'watch',
    severity: 'warning',
    alertTypes: ['crop-stress'],
    title: 'Watch',
    message: 'Test',
    evaluatedAt: '2026-06-08',
    imageDate: '2026-06-08',
    requestedDate: '2026-06-08',
    usedDate: '2026-06-08',
    analysisDate: '2026-06-08',
    dataSource: 'Sentinel Live',
    dataQuality: 'verified',
    dataWarning: null,
    dataReason: null,
    liveVerified: true,
    ndviMean3: 0.54,
    ndviSceneDates: ['2026-06-08', '2026-06-01'],
    ndviSceneValues: [0.55, 0.62],
    ndmiSceneValues: [0.38, 0.35],
    ndwiSceneValues: [0.18, 0.16],
    ndviChangePct2: -11,
    ndviTrendLabel: 'Declining',
    alertReasonLines: [],
    alertExplanation: null,
    ...overrides,
  }) as CropAlertFieldResult

describe('siCropAlertDchasBeacon', () => {
  it('classifies CDSI insight tiers from absolute score', () => {
    expect(classifyCdsiInsightTier(0.52)).toBe('healthy')
    expect(classifyCdsiInsightTier(0.38)).toBe('stable')
    expect(classifyCdsiInsightTier(0.28)).toBe('warning')
    expect(classifyCdsiInsightTier(0.18)).toBe('critical')
  })

  it('computes CHAS from NDVI, NDMI, and CI_RE', () => {
    const chas = computeChas({ ndvi: 0.5, ndmi: 0.2, ciRe: 0.12 })
    expect(chas).toBeGreaterThan(0.2)
    expect(chas).toBeLessThan(0.5)
  })

  it('classifies ΔCHAS risk tiers', () => {
    expect(classifyDchasRiskTier(-0.2)).toBe('critical')
    expect(classifyDchasRiskTier(DCHAS_DELTA_CRITICAL)).toBe('critical')
    expect(classifyDchasRiskTier(-0.1)).toBe('stress')
    expect(classifyDchasRiskTier(DCHAS_DELTA_STRESS)).toBe('stress')
    expect(classifyDchasRiskTier(-0.02)).toBe('watch')
    expect(classifyDchasRiskTier(0)).toBe('watch')
    expect(classifyDchasRiskTier(0.08)).toBe('stable')
  })

  it('maps orb color and blink only from ΔCHAS', () => {
    const critical = resolveDchasOrbPresentation(
      baseResult({
        chasCurrent: 0.4,
        chasPrevious: 0.6,
        deltaChas: -0.2,
      }),
    )
    expect(critical.tier).toBe('critical')
    expect(critical.color).toBe(DCHAS_RISK_COLORS.critical)
    expect(critical.pulse.blinkMs).toBe(DCHAS_ORB_BLINK_MS.critical)

    const stable = resolveDchasOrbPresentation(
      baseResult({
        chasCurrent: 0.62,
        chasPrevious: 0.5,
        deltaChas: 0.12,
      }),
    )
    expect(stable.tier).toBe('stable')
    expect(stable.color).toBe(DCHAS_RISK_COLORS.stable)
    expect(stable.pulse.blinkMs).toBeNull()
    expect(stable.pulse.ringCount).toBe(0)
  })

  it('derives ΔCHAS from current vs previous7 when not stored', () => {
    const orb = resolveDchasOrbPresentation(baseResult())
    expect(orb.chasCurrent).toBeGreaterThan(0)
    expect(orb.chasPrevious).toBeGreaterThan(0)
    expect(orb.deltaChas).toBe(computeDeltaChas(orb.chasCurrent, orb.chasPrevious!))
  })

  it('uses faster blink for higher risk tiers', () => {
    const critical = resolveDchasOrbPresentation(
      baseResult({ chasCurrent: 0.3, chasPrevious: 0.5, deltaChas: -0.2 }),
    )
    const stress = resolveDchasOrbPresentation(
      baseResult({ chasCurrent: 0.45, chasPrevious: 0.53, deltaChas: -0.08 }),
    )
    const watch = resolveDchasOrbPresentation(
      baseResult({ chasCurrent: 0.5, chasPrevious: 0.52, deltaChas: -0.02 }),
    )
    expect(critical.pulse.blinkMs!).toBeLessThan(stress.pulse.blinkMs!)
    expect(stress.pulse.blinkMs!).toBeLessThan(watch.pulse.blinkMs!)
  })
})
