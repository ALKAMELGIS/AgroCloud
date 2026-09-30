import { describe, expect, it } from 'vitest'
import {
  CHAS_ALERT_COLORS,
  classifyChasFusionToAlert,
  classifyChasFusionToClass,
  classifyChasFusionToClassIndex,
  mapChasClassIndexToAlert,
  mapChasClassToAlert,
} from './chasAlertMapping'

describe('chasAlertMapping', () => {
  it('maps CHAS classes 1–10 to four alert levels', () => {
    expect(mapChasClassToAlert(1)).toBe('CRITICAL')
    expect(mapChasClassToAlert(2)).toBe('CRITICAL')
    expect(mapChasClassToAlert(3)).toBe('ACTIVE')
    expect(mapChasClassToAlert(4)).toBe('ACTIVE')
    expect(mapChasClassToAlert(5)).toBe('WARNING')
    expect(mapChasClassToAlert(6)).toBe('WARNING')
    expect(mapChasClassToAlert(7)).toBe('SAFE')
    expect(mapChasClassToAlert(10)).toBe('SAFE')
  })

  it('maps evalscript class index 0–9 to alert levels', () => {
    expect(mapChasClassIndexToAlert(0)).toBe('CRITICAL')
    expect(mapChasClassIndexToAlert(3)).toBe('ACTIVE')
    expect(mapChasClassIndexToAlert(5)).toBe('WARNING')
    expect(mapChasClassIndexToAlert(9)).toBe('SAFE')
  })

  it('classifies continuous fusion scores into classes and alerts', () => {
    const lowClass = classifyChasFusionToClass(-0.15)
    const highClass = classifyChasFusionToClass(0.8)
    expect(lowClass).toBeGreaterThanOrEqual(1)
    expect(lowClass).toBeLessThanOrEqual(10)
    expect(highClass).toBeGreaterThan(lowClass)
    expect(classifyChasFusionToAlert(-0.15)).toBe('CRITICAL')
    expect(['SAFE', 'WARNING']).toContain(classifyChasFusionToAlert(0.8))
  })

  it('assigns distinct alert colors', () => {
    const colors = new Set(Object.values(CHAS_ALERT_COLORS))
    expect(colors.size).toBe(4)
  })

  it('returns class index 0–9 for fusion values', () => {
    expect(classifyChasFusionToClassIndex(0.5)).toBeGreaterThanOrEqual(0)
    expect(classifyChasFusionToClassIndex(0.5)).toBeLessThanOrEqual(9)
  })
})
