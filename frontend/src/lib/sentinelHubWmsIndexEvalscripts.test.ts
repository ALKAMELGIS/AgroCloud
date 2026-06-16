import { describe, expect, it } from 'vitest'
import { buildSentinelIndexColorRampEvalscript } from './sentinelHubWmsIndexEvalscripts'
import { buildSentinelHubWmsAoiClip, inferWmsEvalProfile } from './sentinelHubWmsAoiClip'

describe('sentinelHubWmsIndexEvalscripts', () => {
  it('NDVI evalscript uses cloud-masked 10-class ramp on B08/B04 with transparent NoData', () => {
    const script = buildSentinelIndexColorRampEvalscript('ndvi')
    expect(script).toContain('index(samples.B08, samples.B04)')
    expect(script).toContain('samples.dataMask')
    expect(script).toContain('scl == 3')
    expect(script).not.toContain('samples.SCL == 4')
    expect(script).toContain('CLASS_RGB')
    expect(script).toContain('function ndviClass(val)')
    expect(script).toContain('return [0, 0, 0, 0]')
    expect(script).toContain('0xd73027')
    expect(script).toContain('0x006837')
    expect(script).not.toContain('ColorRampVisualizer')
  })

  it('NDWI evalscript uses 10-class dual color ramp (dry green / wet blue)', () => {
    const script = buildSentinelIndexColorRampEvalscript('ndwi')
    expect(script).toContain('ColorRampVisualizer')
    expect(script).toContain('index(samples.B03, samples.B08)')
    expect(script).toContain('0x008000')
    expect(script).toContain('0x0000cc')
    expect(script).toContain('const BREAKS =')
    expect(script).toContain('function ndwiClass(val)')
    expect(script).toContain('viz1.process(CLASS_T[cls])')
    expect(script).toContain('viz2.process(CLASS_T[cls])')
    expect(script).toContain('samples.dataMask')
  })

  it('NDMI evalscript uses 10-class moisture ramp on B8A/B11', () => {
    const script = buildSentinelIndexColorRampEvalscript('ndmi')
    expect(script).toContain('ColorRampVisualizer')
    expect(script).toContain('index(samples.B8A, samples.B11)')
    expect(script).toContain('0x800000')
    expect(script).toContain('0x000080')
    expect(script).toContain('function ndmiClass(val)')
    expect(script).toContain('viz.process(CLASS_VAL[cls])')
    expect(script).toContain('samples.dataMask')
  })

  it('SAVI evalscript uses soil-adjusted formula on B08/B04', () => {
    const script = buildSentinelIndexColorRampEvalscript('savi')
    expect(script).toContain('1.5) / (samples.B08 + samples.B04 + 0.5)')
    expect(script).toContain('ColorRampVisualizer')
  })

  it('SAVI and NDMI profiles are inferred from layer names', () => {
    expect(inferWmsEvalProfile('SAVI')).toBe('savi')
    expect(inferWmsEvalProfile('Moisture index')).toBe('ndmi')
    expect(inferWmsEvalProfile('NDSI')).toBe('ndsi')
    expect(inferWmsEvalProfile('MNDWI')).toBe('mndwi')
  })

  it('buildSentinelHubWmsAoiClip embeds index ramp evalscript for SAVI layer', () => {
    const drawn = {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [55.1, 25.1],
            [55.2, 25.1],
            [55.2, 25.2],
            [55.1, 25.2],
            [55.1, 25.1],
          ],
        ],
      },
    }
    const { evalscriptB64 } = buildSentinelHubWmsAoiClip(drawn, 'SAVI')
    const decoded = atob(evalscriptB64!)
    expect(decoded).toContain('ColorRampVisualizer')
    expect(decoded).toContain('0x1b5e20')
  })

  it('buildSentinelHubWmsAoiClip embeds ORBIT delta evalscript for DVDI layer', () => {
    const drawn = {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [55.1, 25.1],
            [55.2, 25.1],
            [55.2, 25.2],
            [55.1, 25.2],
            [55.1, 25.1],
          ],
        ],
      },
    }
    const { evalscriptB64 } = buildSentinelHubWmsAoiClip(drawn, 'DVDI')
    const decoded = atob(evalscriptB64!)
    expect(decoded).toContain('Mosaicking.ORBIT')
    expect(decoded).toContain('function evaluatePixel(samples)')
    expect(decoded).toContain('CLASS_RGB')
    expect(decoded).not.toContain('evaluatePixel(samples, scenes)')
  })
})
