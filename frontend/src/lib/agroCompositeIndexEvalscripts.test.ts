import { describe, expect, it } from 'vitest'
import { buildAgroCompositeLayerEvalscript } from './agroCompositeIndexEvalscripts'
import { inferWmsEvalProfile } from './sentinelHubWmsAoiClip'

describe('agroCompositeIndexEvalscripts', () => {
  it('builds static composite evalscript from core bands', () => {
    const script = buildAgroCompositeLayerEvalscript('VHS')
    expect(script).toContain('(ndvi + savi) / 2')
    expect(script).toContain('B8A')
    expect(script).toContain('CLASS_RGB')
    expect(script).toContain('classifyVal')
  })

  it('builds CVHI 4-index mean with ArcPy-aligned 10-class breaks', () => {
    const script = buildAgroCompositeLayerEvalscript('CVHI')
    expect(script).toContain('(ndvi + ndmi + ndwi + savi) / 4')
    expect(script).toContain('const BREAKS = [-0.8, -0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6, 0.8]')
  })

  it('builds delta evalscript with ORBIT mosaicking', () => {
    const script = buildAgroCompositeLayerEvalscript('DVHS')
    expect(script).toContain('Mosaicking.ORBIT')
    expect(script).toContain('function evaluatePixel(samples)')
    expect(script).toContain('samples.length < 2')
    expect(script).toContain('coreAt(samples[0])')
    expect(script).toContain('compositeValue(c2) - compositeValue(c1)')
    expect(script).toContain('CLASS_RGB')
    expect(script).not.toContain('evaluatePixel(samples, scenes)')
  })

  it('treats static DRI as single-scene composite (not delta)', () => {
    const script = buildAgroCompositeLayerEvalscript('DRI')
    expect(script).not.toContain('Mosaicking.ORBIT')
    expect(script).toContain('let ndvi = index(samples.B08, samples.B04)')
  })

  it('builds DDRI as delta composite', () => {
    const script = buildAgroCompositeLayerEvalscript('DDRI')
    expect(script).toContain('Mosaicking.ORBIT')
  })

  it('builds CHAS with four-index fusion formula', () => {
    const script = buildAgroCompositeLayerEvalscript('CHAS')
    expect(script).toContain('0.35 * ndvi + 0.2 * ndwi + 0.25 * ndmi + 0.2 * savi')
    expect(script).toContain('CLASS_RGB')
    expect(script).toContain('classifyVal')
  })

  it('builds CHAS_ALERT derived evalscript with 4-level mapping', () => {
    const script = buildAgroCompositeLayerEvalscript('CHAS_ALERT')
    expect(script).toContain('mapClassToAlert')
    expect(script).toContain('ALERT_RGB')
    expect(script).toContain('0.35 * ndvi + 0.2 * ndwi')
    expect(script).not.toContain('Mosaicking.ORBIT')
  })

  it('builds STRESS_ZONES 5-class evalscript with user CHAS weights', () => {
    const script = buildAgroCompositeLayerEvalscript('STRESS_ZONES')
    expect(script).toContain('0.4 * ndvi + 0.25 * ndmi')
    expect(script).toContain('ZONE_RGB')
    expect(script).not.toContain('Mosaicking.ORBIT')
  })

  it('builds DCHAS delta with ORBIT mosaicking', () => {
    const script = buildAgroCompositeLayerEvalscript('DCHAS')
    expect(script).toContain('Mosaicking.ORBIT')
    expect(script).toContain('function evaluatePixel(samples)')
  })

  it('builds ISS irrigation stress score evalscript', () => {
    const script = buildAgroCompositeLayerEvalscript('ISS')
    expect(script).toContain('0.40 * ndmi + 0.30 * ndwi + 0.20 * ndvi + 0.10 * savi')
    expect(script).toContain('CLASS_RGB')
    expect(script).toContain('classifyVal')
    expect(script).not.toContain('Mosaicking.ORBIT')
  })

  it('builds WDSI water drought situation evalscript', () => {
    const script = buildAgroCompositeLayerEvalscript('WDSI')
    expect(script).toContain('0.40 * ndmi + 0.35 * ndwi + 0.15 * ndvi + 0.10 * savi')
    expect(script).toContain('CLASS_RGB')
    expect(script).toContain('classifyVal')
    expect(script).not.toContain('Mosaicking.ORBIT')
  })

  it('builds WAPI water allocation priority with ORBIT ΔWDSI', () => {
    const script = buildAgroCompositeLayerEvalscript('WAPI')
    expect(script).toContain('Mosaicking.ORBIT')
    expect(script).toContain('0.40 * wdsi2 + 0.20 * dWdsi')
    expect(script).toContain('0.20 * (1 - c2.ndmi)')
    expect(script).toContain('CLASS_RGB')
    expect(script).toContain('classifyVal')
  })

  it('infers agro_composite profile for composite ids', () => {
    expect(inferWmsEvalProfile('CPI')).toBe('agro_composite')
    expect(inferWmsEvalProfile('DCPI')).toBe('agro_composite')
    expect(inferWmsEvalProfile('ISS')).toBe('agro_composite')
    expect(inferWmsEvalProfile('DISS')).toBe('agro_composite')
    expect(inferWmsEvalProfile('WDSI')).toBe('agro_composite')
    expect(inferWmsEvalProfile('DWDSI')).toBe('agro_composite')
    expect(inferWmsEvalProfile('WAPI')).toBe('agro_composite')
    expect(inferWmsEvalProfile('DWAPI')).toBe('agro_composite')
    expect(inferWmsEvalProfile('CHAS_ALERT')).toBe('agro_composite')
    expect(inferWmsEvalProfile('IOI')).toBe('agro_composite')
    expect(inferWmsEvalProfile('CLAY_MI')).toBe('agro_composite')
    expect(inferWmsEvalProfile('GEI')).toBe('agro_composite')
    expect(inferWmsEvalProfile('BSI')).toBe('agro_composite')
    expect(inferWmsEvalProfile('NDVI')).toBe('ndvi')
  })

  it('builds gold exploration indices with S2 band ratios and B12', () => {
    const ioi = buildAgroCompositeLayerEvalscript('IOI')
    expect(ioi).toContain('let val = ioi')
    expect(ioi).toContain('samples.B04 / samples.B02')
    expect(ioi).toContain('B12')
    expect(ioi).toContain('B06')
    expect(ioi).toContain('CLASS_RGB')

    const clay = buildAgroCompositeLayerEvalscript('CLAY_MI')
    expect(clay).toContain('let val = clay_mi')
    expect(clay).toContain('samples.B11 / samples.B12')

    const gei = buildAgroCompositeLayerEvalscript('GEI')
    expect(gei).toContain('0.35 * ioi + 0.30 * clay_mi + 0.20 * fmi + 0.15 * bsi')

    const gci = buildAgroCompositeLayerEvalscript('GCI')
    expect(gci).toContain('0.30 * ioi + 0.25 * clay_mi + 0.20 * fmi + 0.15 * ndai + 0.10 * bsi')
    expect(inferWmsEvalProfile('GCI')).toBe('agro_composite')

    const egci = buildAgroCompositeLayerEvalscript('EGCI')
    expect(egci).toContain('0.30 * ioin + 0.25 * cmin + 0.20 * fmin + 0.15 * ndain + 0.10 * bsin')
    expect(inferWmsEvalProfile('EGCI')).toBe('agro_composite')
  })
})
