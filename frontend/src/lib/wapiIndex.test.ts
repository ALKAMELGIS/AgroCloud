import { describe, expect, it } from 'vitest'
import {
  classifyWapiClassIndex,
  classifyWapiClassNumber,
  computeEtStressFromCore,
  computeWapi,
  computeWdsiFromCore,
  WAPI_CLASS_BREAKS,
  WAPI_CLASS_LABELS,
  WAPI_STATIC_EXPR,
  isWapiLayerId,
} from './wapiIndex'
import { resolveAgroCompositeTenClassRamp } from './agroCompositeLayerRamps'

describe('wapiIndex', () => {
  it('identifies WAPI layer id', () => {
    expect(isWapiLayerId('WAPI')).toBe(true)
    expect(isWapiLayerId('wapi')).toBe(true)
    expect(isWapiLayerId('ISS')).toBe(false)
  })

  it('computes WDSI and ETstress components', () => {
    const core = { ndvi: 0.5, ndmi: 0.1, ndwi: -0.2, savi: 0.4 }
    expect(computeWdsiFromCore(core)).toBeCloseTo(0.4 * 0.1 + 0.35 * -0.2 + 0.15 * 0.5 + 0.1 * 0.4, 5)
    expect(computeEtStressFromCore(core)).toBeCloseTo(
      Math.max(0, Math.min(1, 1 - (0.6 * 0.1 + 0.4 * -0.2))),
      5,
    )
  })

  it('matches static formula when ΔWDSI is 0', () => {
    const core = { ndvi: 0.55, ndmi: -0.05, ndwi: -0.15, savi: 0.45 }
    const wapi = computeWapi(core)
    const wdsi = computeWdsiFromCore(core)
    const et = computeEtStressFromCore(core)
    expect(wapi).toBeCloseTo(0.4 * wdsi + 0.2 * (1 - core.ndmi) + 0.1 * et + 0.1, 5)
    expect(WAPI_STATIC_EXPR).toContain('0.40 * ndmi + 0.35 * ndwi')
  })

  it('applies ΔWDSI weight', () => {
    const core = { ndvi: 0.5, ndmi: 0.0, ndwi: -0.1, savi: 0.4 }
    const base = computeWapi(core)
    const withDelta = computeWapi({ ...core, deltaWdsi: -0.2 })
    expect(withDelta).toBeCloseTo(base + 0.2 * -0.2, 5)
  })

  it('classifies 10 WAPI raster classes', () => {
    expect(classifyWapiClassNumber(0.05)).toBe(1)
    expect(classifyWapiClassNumber(0.09)).toBe(1)
    expect(classifyWapiClassNumber(0.1)).toBe(2)
    expect(classifyWapiClassNumber(0.55)).toBe(6)
    expect(classifyWapiClassNumber(0.75)).toBe(8)
    expect(classifyWapiClassNumber(0.85)).toBe(9)
    expect(classifyWapiClassNumber(0.95)).toBe(10)
    expect(classifyWapiClassIndex(1)).toBe(9)
    expect(WAPI_CLASS_LABELS).toHaveLength(10)
    expect(WAPI_CLASS_BREAKS).toHaveLength(9)
  })

  it('exposes discrete 10-class ramp for Layer Live legend / WMS', () => {
    const ramp = resolveAgroCompositeTenClassRamp('WAPI')
    expect(ramp).toBeTruthy()
    expect(ramp!.breaks).toEqual([...WAPI_CLASS_BREAKS])
    expect(ramp!.classLabels).toHaveLength(10)
    expect(ramp!.classLabels[0]).toContain('Class 1')
    expect(ramp!.classLabels[9]).toContain('Class 10')
    expect(ramp!.valueMin).toBe(0)
    expect(ramp!.valueMax).toBe(1)
    expect(ramp!.classColors[0]).toBe(0x5c6bc0)
    expect(ramp!.classColors[9]).toBe(0xad1457)
  })
})
