import { describe, expect, it } from 'vitest'
import {
  classifyIrrigationAlertLevel,
  computeIrrigationIss,
  decideIrrigationAlert,
  escalateIrrigationAlertLevel,
  IRRIGATION_ALERT_ACTIONS,
  IRRIGATION_ALERT_LEVEL_COLORS,
} from './irrigationDroughtAlert'

describe('irrigationDroughtAlert', () => {
  it('computes ISS with NDMI/NDWI/NDVI/SAVI weights', () => {
    // ISS = 0.40·NDMI + 0.30·NDWI + 0.20·NDVI + 0.10·SAVI
    const iss = computeIrrigationIss({ ndvi: 0.5, ndmi: 0.2, ndwi: 0.1, savi: 0.4 })
    expect(iss).toBeCloseTo(0.4 * 0.2 + 0.3 * 0.1 + 0.2 * 0.5 + 0.1 * 0.4, 5)
  })

  it('classifies ISS irrigation thresholds', () => {
    expect(classifyIrrigationAlertLevel(-0.4)).toBe('critical')
    expect(classifyIrrigationAlertLevel(-0.39)).toBe('severe')
    expect(classifyIrrigationAlertLevel(-0.3)).toBe('severe')
    expect(classifyIrrigationAlertLevel(-0.27)).toBe('warning')
    expect(classifyIrrigationAlertLevel(-0.2)).toBe('warning')
    expect(classifyIrrigationAlertLevel(-0.16)).toBe('watch')
    expect(classifyIrrigationAlertLevel(0)).toBe('watch')
    expect(classifyIrrigationAlertLevel(0.07)).toBe('safe')
    expect(classifyIrrigationAlertLevel(0.3)).toBe('safe')
    expect(classifyIrrigationAlertLevel(0.42)).toBe('safe')
    expect(classifyIrrigationAlertLevel(0.43)).toBe('overwatering')
  })

  it('escalates one level when ISS drops more than 0.05', () => {
    expect(escalateIrrigationAlertLevel('watch', -0.06)).toEqual({
      level: 'warning',
      escalated: true,
    })
    expect(escalateIrrigationAlertLevel('severe', -0.08)).toEqual({
      level: 'critical',
      escalated: true,
    })
    expect(escalateIrrigationAlertLevel('safe', -0.02)).toEqual({
      level: 'safe',
      escalated: false,
    })
    expect(escalateIrrigationAlertLevel('critical', -0.1)).toEqual({
      level: 'critical',
      escalated: false,
    })
    expect(escalateIrrigationAlertLevel('overwatering', -0.06)).toEqual({
      level: 'safe',
      escalated: true,
    })
  })

  it('builds actionable English alert with irrigation amounts', () => {
    const d = decideIrrigationAlert({
      zoneName: 'Pivot A',
      current: { ndvi: 0.2, ndmi: -0.45, ndwi: -0.4 },
      previous: { ndvi: 0.35, ndmi: -0.2, ndwi: -0.15 },
    })
    expect(['critical', 'severe', 'warning']).toContain(d.alertLevel)
    expect(d.action).toBe(IRRIGATION_ALERT_ACTIONS[d.alertLevel])
    expect(d.message).toContain('Pivot A')
    expect(d.message).toContain('ISS')
    expect(d.color).toBe(IRRIGATION_ALERT_LEVEL_COLORS[d.alertLevel])
    expect(Number.isFinite(d.iss)).toBe(true)
  })

  it('marks Safe fields with No action', () => {
    const d = decideIrrigationAlert({
      zoneName: 'North',
      current: { ndvi: 0.55, ndmi: 0.25, ndwi: 0.15 },
    })
    expect(d.alertLevel).toBe('safe')
    expect(d.action).toBe('No action')
  })
})
