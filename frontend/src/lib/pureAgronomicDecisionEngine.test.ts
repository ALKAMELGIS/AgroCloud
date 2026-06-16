import { describe, expect, it } from 'vitest'
import {
  analyzeSpatialHistogram,
  classifyBioticStatus,
  classifyTrend,
  classifyVegetationStatus,
  classifyWaterStatus,
  computeConfidence,
  computeDeltas,
  computeTrendScore,
  evaluatePureAgronomicDecision,
  resolveAgronomicDecision,
  resolvePrimarySignal,
  resolveRiskLevel,
  type PureAgronomicDecisionInput,
} from './pureAgronomicDecisionEngine'

function makeInput(
  overrides: Partial<{
    current: { NDVI: number; NDMI: number; NDWI: number }
    prev1: { NDVI: number; NDMI: number; NDWI: number }
    prev2: { NDVI: number; NDMI: number; NDWI: number }
    bins: Array<{ class: 'healthy' | 'stressed' | 'bare'; ratio: number }>
  }> = {},
): PureAgronomicDecisionInput {
  return {
    current: overrides.current ?? { NDVI: 0.62, NDMI: 0.18, NDWI: 0.14 },
    history: {
      prev1: overrides.prev1 ?? { NDVI: 0.6, NDMI: 0.17, NDWI: 0.13 },
      prev2: overrides.prev2 ?? { NDVI: 0.59, NDMI: 0.16, NDWI: 0.12 },
    },
    histogram: {
      bins: overrides.bins ?? [
        { class: 'healthy', ratio: 0.62 },
        { class: 'stressed', ratio: 0.28 },
        { class: 'bare', ratio: 0.1 },
      ],
    },
  }
}

describe('pureAgronomicDecisionEngine v3 — signal locking', () => {
  it('locks primary signal to strongest delta magnitude', () => {
    expect(resolvePrimarySignal({ NDVI: -0.08, NDMI: -0.02, NDWI: 0.01 })).toBe('VEGETATION')
    expect(resolvePrimarySignal({ NDVI: -0.02, NDMI: -0.09, NDWI: 0.01 })).toBe('MOISTURE')
    expect(resolvePrimarySignal({ NDVI: -0.02, NDMI: -0.01, NDWI: -0.07 })).toBe('SURFACE_WATER')
  })

  it('uses v3 trend weights and thresholds', () => {
    const deltas = { NDVI: 0.1, NDMI: 0.05, NDWI: -0.02 }
    expect(computeTrendScore(deltas)).toBeCloseTo(0.1 * 0.6 + 0.05 * 0.3 + -0.02 * 0.1, 5)
    expect(classifyTrend(-0.03)).toBe('DECLINING')
    expect(classifyTrend(0.03)).toBe('IMPROVING')
    expect(classifyTrend(0.01)).toBe('STABLE')
  })
})

describe('pureAgronomicDecisionEngine v3 — classification bands', () => {
  it('classifies water with tight non-overlapping boundaries', () => {
    expect(classifyWaterStatus({ NDVI: 0.5, NDMI: -0.12, NDWI: 0.03 })).toBe('SEVERE_DROUGHT')
    expect(classifyWaterStatus({ NDVI: 0.5, NDMI: -0.08, NDWI: 0.1 })).toBe('MODERATE_DROUGHT')
    expect(classifyWaterStatus({ NDVI: 0.5, NDMI: 0.25, NDWI: 0.3 })).toBe('WATERLOGGING')
    expect(classifyWaterStatus({ NDVI: 0.5, NDMI: 0.1, NDWI: 0.1 })).toBe('NORMAL')
  })

  it('classifies vegetation with fixed non-overlapping bins', () => {
    expect(
      classifyVegetationStatus(
        { NDVI: 0.7, NDMI: 0.1, NDWI: 0.08 },
        { prev1: { NDVI: 0.65, NDMI: 0.1, NDWI: 0.08 }, prev2: { NDVI: 0.6, NDMI: 0.1, NDWI: 0.08 } },
        'ACTIVE_CROP_ONGOING',
      ),
    ).toBe('VERY_HEALTHY')
    expect(
      classifyVegetationStatus(
        { NDVI: 0.5, NDMI: 0.1, NDWI: 0.08 },
        { prev1: { NDVI: 0.48, NDMI: 0.1, NDWI: 0.08 }, prev2: { NDVI: 0.46, NDMI: 0.1, NDWI: 0.08 } },
        'ACTIVE_CROP_ONGOING',
      ),
    ).toBe('HEALTHY')
    expect(
      classifyVegetationStatus(
        { NDVI: 0.3, NDMI: 0.1, NDWI: 0.08 },
        { prev1: { NDVI: 0.28, NDMI: 0.1, NDWI: 0.08 }, prev2: { NDVI: 0.26, NDMI: 0.1, NDWI: 0.08 } },
        'ACTIVE_CROP_ONGOING',
      ),
    ).toBe('STRESSED')
    expect(
      classifyVegetationStatus(
        { NDVI: 0.15, NDMI: 0.01, NDWI: 0.01 },
        { prev1: { NDVI: 0.05, NDMI: 0.0, NDWI: 0.0 }, prev2: { NDVI: 0.04, NDMI: 0.0, NDWI: 0.0 } },
        'BARE_SOIL_UNPLANTED',
      ),
    ).toBe('DEGRADED')
  })

  it('blocks biotic classification on very healthy canopy', () => {
    expect(
      classifyBioticStatus({ NDVI: -0.05, NDMI: 0.01, NDWI: 0.0 }, 'VERY_HEALTHY'),
    ).toBe('NONE')
    expect(
      classifyBioticStatus({ NDVI: -0.05, NDMI: 0.01, NDWI: 0.0 }, 'HEALTHY'),
    ).toBe('BIOTIC_STRESS')
    expect(
      classifyBioticStatus({ NDVI: -0.05, NDMI: -0.04, NDWI: -0.01 }, 'STRESSED'),
    ).toBe('ENVIRONMENTAL_STRESS')
  })

  it('derives spatial flags with stressed+bare stress ratio', () => {
    const spatial = analyzeSpatialHistogram([
      { class: 'healthy', ratio: 0.45 },
      { class: 'stressed', ratio: 0.4 },
      { class: 'bare', ratio: 0.15 },
    ])
    expect(spatial.stress_ratio).toBeCloseTo(0.55, 5)
    expect(spatial.high_alert).toBe(true)
    expect(spatial.alert_risk).toBe(true)
    expect(spatial.stable_spatial).toBe(false)
  })

  it('marks stable spatial when neither alert rule fires', () => {
    const spatial = analyzeSpatialHistogram([
      { class: 'healthy', ratio: 0.7 },
      { class: 'stressed', ratio: 0.2 },
      { class: 'bare', ratio: 0.1 },
    ])
    expect(spatial.stable_spatial).toBe(true)
    expect(spatial.high_alert).toBe(false)
    expect(spatial.alert_risk).toBe(false)
  })
})

describe('pureAgronomicDecisionEngine v3 — land activity guard', () => {
  it('returns NO_CROP_ACTIVITY_DETECTED for bare soil', () => {
    const result = evaluatePureAgronomicDecision(
      makeInput({
        current: { NDVI: 0.06, NDMI: 0.01, NDWI: 0.02 },
        prev1: { NDVI: 0.05, NDMI: 0.0, NDWI: 0.01 },
        prev2: { NDVI: 0.04, NDMI: 0.01, NDWI: 0.0 },
      }),
    )
    expect(result.land_state).toBe('BARE_SOIL_UNPLANTED')
    expect(result.agronomic_decision).toBe('NO_CROP_ACTIVITY_DETECTED')
    expect(result.risk_level).toBe('LOW')
    expect(result.show_crop_health_alert).toBe(false)
  })

  it('downgrades high NDVI without growth pattern from healthy classification', () => {
    const result = evaluatePureAgronomicDecision(
      makeInput({
        current: { NDVI: 0.55, NDMI: 0.12, NDWI: 0.08 },
        prev1: { NDVI: 0.56, NDMI: 0.12, NDWI: 0.08 },
        prev2: { NDVI: 0.57, NDMI: 0.11, NDWI: 0.07 },
      }),
    )
    expect(result.vegetation_status).toBe('STRESSED')
  })
})

describe('pureAgronomicDecisionEngine v3 — decision priority', () => {
  it('prioritizes severe drought over declining trend', () => {
    const result = evaluatePureAgronomicDecision(
      makeInput({
        current: { NDVI: 0.35, NDMI: -0.12, NDWI: 0.03 },
        prev1: { NDVI: 0.55, NDMI: 0.05, NDWI: 0.1 },
      }),
    )
    expect(result.water_status).toBe('SEVERE_DROUGHT')
    expect(result.agronomic_decision).toBe('IRRIGATION_REQUIRED_IMMEDIATELY')
    expect(result.risk_level).toBe('CRITICAL')
  })

  it('requires drainage for waterlogging', () => {
    const result = evaluatePureAgronomicDecision(
      makeInput({
        current: { NDVI: 0.55, NDMI: 0.25, NDWI: 0.3 },
        prev1: { NDVI: 0.58, NDMI: 0.22, NDWI: 0.24 },
      }),
    )
    expect(result.agronomic_decision).toBe('DRAINAGE_REQUIRED')
    expect(result.risk_level).toBe('CRITICAL')
  })

  it('requires disease inspection for degraded biotic stress', () => {
    const result = evaluatePureAgronomicDecision(
      makeInput({
        current: { NDVI: 0.17, NDMI: 0.12, NDWI: 0.1 },
        prev1: { NDVI: 0.28, NDMI: 0.13, NDWI: 0.1 },
        prev2: { NDVI: 0.32, NDMI: 0.14, NDWI: 0.1 },
      }),
    )
    expect(result.vegetation_status).toBe('DEGRADED')
    expect(result.biotic_status).toBe('BIOTIC_STRESS')
    expect(result.agronomic_decision).toBe('DISEASE_INSPECTION_REQUIRED')
  })

  it('issues early warning when trend is declining', () => {
    const result = evaluatePureAgronomicDecision(
      makeInput({
        current: { NDVI: 0.55, NDMI: 0.08, NDWI: 0.1 },
        prev1: { NDVI: 0.72, NDMI: 0.2, NDWI: 0.18 },
      }),
    )
    expect(result.trend).toBe('DECLINING')
    expect(result.agronomic_decision).toBe('EARLY_WARNING_MONITORING')
  })

  it('returns field stable for healthy stable crop', () => {
    const result = evaluatePureAgronomicDecision(makeInput())
    expect(result.agronomic_decision).toBe('FIELD_STABLE')
    expect(result.risk_level).toBe('LOW')
    expect(result.primary_signal).toBeTruthy()
  })
})

describe('pureAgronomicDecisionEngine v3 — risk engine', () => {
  it('assigns HIGH only for stressed and declining', () => {
    const risk = resolveRiskLevel('ACTIVE_CROP_ONGOING', 'NORMAL', 'STRESSED', 'ENVIRONMENTAL_STRESS', 'DECLINING', {
      healthy_ratio: 0.55,
      stress_ratio: 0.3,
      entropy_proxy: 0.5,
      high_alert: false,
      alert_risk: false,
      stable_spatial: true,
    })
    expect(risk).toBe('HIGH')
  })

  it('does not elevate HIGH from spatial alert alone', () => {
    const risk = resolveRiskLevel('ACTIVE_CROP_ONGOING', 'NORMAL', 'HEALTHY', 'NONE', 'STABLE', {
      healthy_ratio: 0.4,
      stress_ratio: 0.5,
      entropy_proxy: 0.5,
      high_alert: true,
      alert_risk: true,
      stable_spatial: false,
    })
    expect(risk).toBe('MEDIUM')
  })

  it('assigns MEDIUM for moderate drought', () => {
    const risk = resolveRiskLevel('ACTIVE_CROP_ONGOING', 'MODERATE_DROUGHT', 'HEALTHY', 'NONE', 'STABLE', {
      healthy_ratio: 0.7,
      stress_ratio: 0.2,
      entropy_proxy: 0.4,
      high_alert: false,
      alert_risk: false,
      stable_spatial: true,
    })
    expect(risk).toBe('MEDIUM')
  })
})

describe('pureAgronomicDecisionEngine v3 — confidence', () => {
  it('combines signal strength, spatial separation, and temporal consistency', () => {
    const deltas = computeDeltas(
      { NDVI: 0.62, NDMI: 0.18, NDWI: 0.14 },
      { NDVI: 0.5, NDMI: 0.17, NDWI: 0.13 },
    )
    const spatial = analyzeSpatialHistogram([
      { class: 'healthy', ratio: 0.7 },
      { class: 'stressed', ratio: 0.2 },
      { class: 'bare', ratio: 0.1 },
    ])
    const confidence = computeConfidence(deltas, spatial)
    expect(confidence).toBeGreaterThan(0.5)
    expect(confidence).toBeLessThanOrEqual(1)
  })

  it('reduces temporal consistency when delta signs diverge', () => {
    const aligned = computeConfidence(
      { NDVI: 0.04, NDMI: 0.02, NDWI: 0.01 },
      analyzeSpatialHistogram([{ class: 'healthy', ratio: 0.8 }]),
    )
    const divergent = computeConfidence(
      { NDVI: 0.04, NDMI: -0.02, NDWI: 0.01 },
      analyzeSpatialHistogram([{ class: 'healthy', ratio: 0.8 }]),
    )
    expect(aligned).toBeGreaterThan(divergent)
  })
})

describe('pureAgronomicDecisionEngine v3 — strict decision resolver', () => {
  it('follows priority order explicitly', () => {
    expect(
      resolveAgronomicDecision('ACTIVE_CROP_ONGOING', 'SEVERE_DROUGHT', 'DEGRADED', 'BIOTIC_STRESS', 'DECLINING'),
    ).toBe('IRRIGATION_REQUIRED_IMMEDIATELY')
    expect(
      resolveAgronomicDecision('ACTIVE_CROP_ONGOING', 'WATERLOGGING', 'DEGRADED', 'BIOTIC_STRESS', 'DECLINING'),
    ).toBe('DRAINAGE_REQUIRED')
    expect(
      resolveAgronomicDecision('ACTIVE_CROP_ONGOING', 'NORMAL', 'DEGRADED', 'BIOTIC_STRESS', 'DECLINING'),
    ).toBe('DISEASE_INSPECTION_REQUIRED')
    expect(resolveAgronomicDecision('ACTIVE_CROP_ONGOING', 'NORMAL', 'HEALTHY', 'NONE', 'DECLINING')).toBe(
      'EARLY_WARNING_MONITORING',
    )
    expect(resolveAgronomicDecision('ACTIVE_CROP_ONGOING', 'NORMAL', 'HEALTHY', 'NONE', 'STABLE')).toBe(
      'FIELD_STABLE',
    )
    expect(
      resolveAgronomicDecision('BARE_SOIL_UNPLANTED', 'NORMAL', 'DEGRADED', 'NONE', 'STABLE'),
    ).toBe('NO_CROP_ACTIVITY_DETECTED')
  })
})
