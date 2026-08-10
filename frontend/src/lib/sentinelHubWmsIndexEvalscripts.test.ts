import { describe, expect, it } from 'vitest'
import {
  buildSentinelIndexColorRampEvalscript,
  sampleSentinelNdviColorMap,
  SENTINEL_NDVI_VEGETATION_GROWTH_RAMP,
} from './sentinelHubWmsIndexEvalscripts'
import { buildSentinelHubWmsAoiClip, inferWmsEvalProfile } from './sentinelHubWmsAoiClip'

describe('sentinelHubWmsIndexEvalscripts', () => {
  it('NDVI evalscript uses a fast color ramp on B08/B04 with dataMask alpha (no SCL holes)', () => {
    const script = buildSentinelIndexColorRampEvalscript('ndvi')
    expect(script).toContain('index(samples.B08, samples.B04)')
    expect(script).toContain('samples.dataMask')
    expect(script).toContain('ColorRampVisualizer')
    expect(script).toContain('visualizer.process(ndvi)')
    // Fast/complete render: no per-pixel SCL cloud masking and no heavy gradient code.
    expect(script).not.toContain('SCL')
    expect(script).not.toContain('scl == 3')
    expect(script).not.toContain('function findColor(val)')
    expect(script).not.toContain('function blendRgb')
    expect(script).not.toContain('return [0, 0, 0, 0]')
    // Only the 3 bands needed for NDVI are requested.
    expect(script).toContain('["B04", "B08", "dataMask"]')
  })

  it('NDVI growth ramp samples smooth light-to-dark greens for legend and raster parity', () => {
    const greenCh = (hex: number) => (hex >> 8) & 0xff
    const light = sampleSentinelNdviColorMap(0.42)
    const medium = sampleSentinelNdviColorMap(0.57)
    const dark = sampleSentinelNdviColorMap(0.72)
    expect(light).toBe(SENTINEL_NDVI_VEGETATION_GROWTH_RAMP[0]![1])
    expect(greenCh(medium)).toBeLessThan(greenCh(light))
    expect(greenCh(dark)).toBeLessThan(greenCh(medium))
    expect(sampleSentinelNdviColorMap(0.41)).toBe(0xffffbf)
  })

  it('NDWI evalscript uses 10-class dry warm / wet blue ramp', () => {
    const script = buildSentinelIndexColorRampEvalscript('ndwi')
    expect(script).toContain('ColorRampVisualizer')
    expect(script).toContain('index(samples.B03, samples.B08)')
    expect(script).toContain('0x7f0000')
    expect(script).toContain('0xffeb3b')
    expect(script).toContain('0x0000cc')
    expect(script).toContain('const BREAKS =')
    expect(script).toContain('function ndwiClass(val)')
    expect(script).toContain('viz.process(cls)')
    expect(script).toContain('samples.dataMask')
  })

  it('NDMI evalscript uses 10-class moisture ramp on B8A/B11', () => {
    const script = buildSentinelIndexColorRampEvalscript('ndmi')
    expect(script).toContain('ColorRampVisualizer')
    expect(script).toContain('index(samples.B8A, samples.B11)')
    expect(script).toContain('0x7f0000')
    expect(script).toContain('0xffeb3b')
    expect(script).toContain('0x81d4fa')
    expect(script).toContain('0x0d47a1')
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
    expect(inferWmsEvalProfile('ET')).toBe('et')
    expect(inferWmsEvalProfile('Evapotranspiration')).toBe('et')
    expect(inferWmsEvalProfile('LST')).toBe('lst')
    expect(inferWmsEvalProfile('Land Surface Temperature')).toBe('lst')
    expect(inferWmsEvalProfile('Moisture index')).toBe('ndmi')
    // NDSI is registered as an agro composite (soil/salinity family).
    expect(inferWmsEvalProfile('NDSI')).toBe('agro_composite')
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
