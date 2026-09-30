import { describe, expect, it } from 'vitest'
import {
  NDVI_AGRICULTURAL_RAMP,
  NDVI_DELTA_ALERT_THRESHOLD,
  buildLandInterpretationLayer,
  classifyNdviLandZone,
  resolveNdviDeltaAlert,
  resolveUnifiedFieldPresentation,
} from './siCropAlertNdviZones'

describe('siCropAlertNdviZones', () => {
  it('ramp stops are strictly increasing', () => {
    for (let i = 1; i < NDVI_AGRICULTURAL_RAMP.length; i++) {
      expect(NDVI_AGRICULTURAL_RAMP[i]![0]).toBeGreaterThan(NDVI_AGRICULTURAL_RAMP[i - 1]![0])
    }
  })

  it('classifies unified land zones with matching color and icon', () => {
    expect(classifyNdviLandZone(0.02)).toMatchObject({
      id: 'bare',
      color: '#d32f2f',
      icon: 'fa-xmark',
      label: 'FALLOW / FAILURE',
    })
    expect(classifyNdviLandZone(0.32)).toMatchObject({
      id: 'watch',
      color: '#ffeb3b',
      icon: 'fa-eye',
    })
    expect(classifyNdviLandZone(0.5)).toMatchObject({
      id: 'healthy',
      color: '#aeea00',
      icon: 'fa-leaf',
      label: 'MODERATE HEALTH',
    })
    expect(classifyNdviLandZone(0.82)).toMatchObject({
      id: 'harvest-ready',
      color: '#1b5e20',
      icon: 'fa-wheat-awn',
    })
  })

  it('delta alert triggers only on rapid change', () => {
    expect(resolveNdviDeltaAlert(-NDVI_DELTA_ALERT_THRESHOLD - 0.01).type).toBe('ALERT_RED')
    expect(resolveNdviDeltaAlert(NDVI_DELTA_ALERT_THRESHOLD + 0.01).type).toBe('ALERT_GREEN')
    expect(resolveNdviDeltaAlert(0.05).type).toBe('NORMAL')
  })

  it('unified presentation aligns color icon and land interpretation', () => {
    const p = resolveUnifiedFieldPresentation(0.32, [0.32, 0.5], { ndmi: 0.12, ndwi: 0.08 })
    expect(p.color).toBe('#ffeb3b')
    expect(p.icon).toBe('fa-eye')
    expect(p.deltaAlert.type).toBe('ALERT_RED')
    expect(p.landInterpretation[0]).toContain('WATCH')
    expect(buildLandInterpretationLayer(0.32, [0.32, 0.5]).some(l => l.includes('rapid'))).toBe(true)
  })

  it('maps NDVI ramp colors distinctly for low vs high canopy', () => {
    const low = resolveUnifiedFieldPresentation(0.08, [0.08, 0.07, 0.07], { ndmi: 0.01, ndwi: 0.01 })
    const mid = resolveUnifiedFieldPresentation(0.32, [0.32, 0.28, 0.26], { ndmi: 0.1, ndwi: 0.08 })
    const high = resolveUnifiedFieldPresentation(0.68, [0.68, 0.62, 0.58], { ndmi: 0.22, ndwi: 0.14 })
    expect(low.color).not.toBe(high.color)
    expect(mid.color).not.toBe(high.color)
    expect(low.showCropHealthAlert).toBe(false)
    expect(high.showCropHealthAlert).toBe(true)
  })

  it('uses gray presentation for bare unplanted fields', () => {
    const p = resolveUnifiedFieldPresentation(0.06, [0.06, 0.05, 0.04], {
      ndmi: 0.01,
      ndwi: 0.02,
    })
    expect(p.landState).toBe('BARE_SOIL_UNPLANTED')
    expect(p.showCropHealthAlert).toBe(false)
    expect(p.color).toBe('#90a4ae')
    expect(p.pulse.ringCount).toBe(0)
  })
})
