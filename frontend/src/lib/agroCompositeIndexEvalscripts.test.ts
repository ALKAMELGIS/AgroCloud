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

  it('builds DCHAS delta with ORBIT mosaicking', () => {
    const script = buildAgroCompositeLayerEvalscript('DCHAS')
    expect(script).toContain('Mosaicking.ORBIT')
    expect(script).toContain('function evaluatePixel(samples)')
  })

  it('infers agro_composite profile for composite ids', () => {
    expect(inferWmsEvalProfile('CPI')).toBe('agro_composite')
    expect(inferWmsEvalProfile('DCPI')).toBe('agro_composite')
    expect(inferWmsEvalProfile('CHAS_ALERT')).toBe('agro_composite')
    expect(inferWmsEvalProfile('NDVI')).toBe('ndvi')
  })
})
