import { describe, expect, it } from 'vitest'
import {
  calculateWeightedFusionDelta,
  detectCloudShadowAnomaly,
  evaluatePlantHealthFusion,
  resolveQuadColorAlertLevel,
} from './plantHealthFusionEngine'
import { fusionMarkerColor } from './plantHealthFusionMarkerSync'

const baseWeather = {
  temperature2mC: 32,
  relativeHumidity2mPct: 28,
  precipitationMm: 0,
  evapotranspirationEt0Mm: 6.5,
}

describe('plantHealthFusionEngine — Weighted Fusion', () => {
  it('classifies optimal growth when WFI >= -0.02', () => {
    const r = evaluatePlantHealthFusion({
      fieldId: 'f1',
      tCurrent: { date: '2026-05-07', ndvi: 0.66, ndmi: 0.31, ndwi: 0.26 },
      tPrevious: { date: '2026-05-02', ndvi: 0.64, ndmi: 0.29, ndwi: 0.25 },
      weather: baseWeather,
    })
    expect(r.weighted_fusion_delta).toBeGreaterThanOrEqual(-0.02)
    expect(r.agronomic_status).toBe('OPTIMAL_GROWTH')
    expect(r.alert_level).toBe('GREEN')
    expect(r.marker_color).toBe(fusionMarkerColor('GREEN'))
  })

  it('WFI dampens minor NDVI drop when NDMI/NDWI stable', () => {
    const deltas = { ndviDelta: -0.05, ndmiDelta: 0.02, ndwiDelta: 0.03 }
    const wfi = calculateWeightedFusionDelta(deltas)
    expect(wfi).toBeGreaterThan(-0.02)
  })

  it('detects environmental drought (NDMI down, ET0 high, zero rain)', () => {
    const r = evaluatePlantHealthFusion({
      fieldId: 'f2',
      tCurrent: { date: '2026-06-01', ndvi: 0.55, ndmi: 0.18, ndwi: 0.12 },
      tPrevious: { date: '2026-05-27', ndvi: 0.58, ndmi: 0.28, ndwi: 0.14 },
      weather: baseWeather,
      windowDays: 5,
    })
    expect(r.agronomic_status).toBe('ENVIRONMENTAL_DROUGHT')
    expect(['ORANGE', 'RED']).toContain(r.alert_level)
    expect(r.localized_message).toContain('إجهاد مائي')
  })

  it('detects biotic stress when NDVI drops but NDMI stable', () => {
    const r = evaluatePlantHealthFusion({
      fieldId: 'f3',
      tCurrent: { date: '2026-06-01', ndvi: 0.52, ndmi: 0.3, ndwi: 0.22 },
      tPrevious: { date: '2026-05-27', ndvi: 0.6, ndmi: 0.31, ndwi: 0.21 },
      weather: { ...baseWeather, precipitationMm: 2 },
      windowDays: 5,
    })
    expect(r.agronomic_status).toBe('BIOTIC_STRESS')
    expect(r.alert_level).toBe('ORANGE')
  })

  it('flags cloud anomaly and retains previous valid status', () => {
    const anomaly = detectCloudShadowAnomaly(
      { ndviDelta: -0.65, ndmiDelta: 0.01, ndwiDelta: 0.0 },
      3,
      baseWeather,
    )
    expect(anomaly).toBe(true)

    const r = evaluatePlantHealthFusion({
      fieldId: 'f4',
      tCurrent: { date: '2026-06-01', ndvi: 0.05, ndmi: 0.28, ndwi: 0.2 },
      tPrevious: { date: '2026-05-29', ndvi: 0.7, ndmi: 0.27, ndwi: 0.2 },
      weather: baseWeather,
      windowDays: 3,
      previousValidStatus: 'OPTIMAL_GROWTH',
      previousValidAlertLevel: 'GREEN',
    })
    expect(r.anomaly_detected).toBe(true)
    expect(r.retained_previous_status).toBe(true)
    expect(r.agronomic_status).toBe('OPTIMAL_GROWTH')
    expect(r.alert_level).toBe('GREEN')
  })

  it('classifies harvest when WFI <= -0.35 in harvest window', () => {
    const r = evaluatePlantHealthFusion({
      fieldId: 'f5',
      tCurrent: { date: '2026-06-01', ndvi: 0.12, ndmi: 0.05, ndwi: 0.08 },
      tPrevious: { date: '2026-05-20', ndvi: 0.72, ndmi: 0.42, ndwi: 0.18 },
      weather: baseWeather,
      windowDays: 12,
      cropCalendar: { inHarvestWindow: true },
    })
    expect(r.weighted_fusion_delta).toBeLessThanOrEqual(-0.35)
    expect(r.agronomic_status).toBe('HARVESTED_OR_PLOWED')
    expect(r.alert_level).toBe('GREEN')
  })

  it('quad-color tiers follow WFI thresholds', () => {
    expect(resolveQuadColorAlertLevel(-0.01, 'STABLE_MONITOR', { ndviDelta: 0, ndmiDelta: 0, ndwiDelta: 0 }, baseWeather)).toBe('GREEN')
    expect(resolveQuadColorAlertLevel(-0.03, 'MIXED_STRESS', { ndviDelta: -0.04, ndmiDelta: -0.02, ndwiDelta: 0, }, baseWeather)).toBe('YELLOW')
    expect(resolveQuadColorAlertLevel(-0.07, 'MIXED_STRESS', { ndviDelta: -0.08, ndmiDelta: -0.02, ndwiDelta: -0.02 }, { ...baseWeather, evapotranspirationEt0Mm: 2, precipitationMm: 1 })).toBe('ORANGE')
    expect(resolveQuadColorAlertLevel(-0.12, 'MIXED_STRESS', { ndviDelta: -0.15, ndmiDelta: -0.1, ndwiDelta: -0.05 }, baseWeather)).toBe('RED')
  })

  it('detects waterlogging with rain + rising NDWI', () => {
    const r = evaluatePlantHealthFusion({
      fieldId: 'f6',
      tCurrent: { date: '2026-06-01', ndvi: 0.48, ndmi: 0.22, ndwi: 0.35 },
      tPrevious: { date: '2026-05-28', ndvi: 0.58, ndmi: 0.28, ndwi: 0.22 },
      weather: { ...baseWeather, precipitationMm: 18 },
      windowDays: 4,
    })
    expect(r.agronomic_status).toBe('WATERLOGGING')
    expect(['ORANGE', 'RED']).toContain(r.alert_level)
  })
})
