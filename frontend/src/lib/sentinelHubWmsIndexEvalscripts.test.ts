import { describe, expect, it } from 'vitest'
import {
  buildSentinelIndexColorRampEvalscript,
  sampleSentinelNdviColorMap,
  SENTINEL_NDVI_VEGETATION_GROWTH_RAMP,
} from './sentinelHubWmsIndexEvalscripts'
import { buildSentinelHubWmsAoiClip, inferWmsEvalProfile } from './sentinelHubWmsAoiClip'

describe('sentinelHubWmsIndexEvalscripts', () => {
  it('NDVI evalscript uses a fast color ramp on B08/B04 with opaque GEOMETRY clip alpha (no SCL holes)', () => {
    const script = buildSentinelIndexColorRampEvalscript('ndvi')
    expect(script).toContain('index(samples.B08, samples.B04)')
    expect(script).toContain('["B04", "B08", "dataMask"]')
    expect(script).toContain('ColorRampVisualizer')
    expect(script).toContain('visualizer.process(ndvi)')
    expect(script).toContain('concat(samples.dataMask)')
    expect(script).not.toContain('imgVals.concat(1)')
    expect(script).not.toContain('SCL')
    expect(script).not.toContain('scl == 3')
    expect(script).not.toContain('function findColor(val)')
    expect(script).not.toContain('function blendRgb')
    expect(script).not.toContain('return [0, 0, 0, 0]')
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

  it('NDWI evalscript uses continuous green-white-blue ColorRampVisualizer', () => {
    const script = buildSentinelIndexColorRampEvalscript('ndwi')
    expect(script).toContain('ColorRampVisualizer')
    expect(script).toContain('index(samples.B03, samples.B08)')
    expect(script).toContain('0x008000')
    expect(script).toContain('0xffffff')
    expect(script).toContain('0x0000cc')
    expect(script).toContain('visualizer.process(val)')
    expect(script).toContain('concat(samples.dataMask)')
    expect(script).not.toContain('ndwiClass')
    expect(script).not.toContain('imgVals.concat(1)')
  })

  it('NDMI evalscript uses continuous moisture ramp on B8A/B11', () => {
    const script = buildSentinelIndexColorRampEvalscript('ndmi')
    expect(script).toContain('ColorRampVisualizer')
    expect(script).toContain('index(samples.B8A, samples.B11)')
    expect(script).toContain('0x800000')
    expect(script).toContain('0xff0000')
    expect(script).toContain('0xffff00')
    expect(script).toContain('0x00ffff')
    expect(script).toContain('0x0000ff')
    expect(script).toContain('0x000080')
    expect(script).toContain('viz.process(val)')
    expect(script).toContain('concat(samples.dataMask)')
    expect(script).not.toContain('ndmiClass')
    expect(script).not.toContain('imgVals.concat(1)')
  })

  it('SAVI evalscript uses soil-adjusted formula on B08/B04', () => {
    const script = buildSentinelIndexColorRampEvalscript('savi')
    expect(script).toContain('1.5) / (samples.B08 + samples.B04 + 0.5)')
    expect(script).toContain('ColorRampVisualizer')
  })

  it('AWEI evalscript uses 10-class flood/water reclass on multi-band formula', () => {
    const script = buildSentinelIndexColorRampEvalscript('awei')
    expect(script).toContain('4.0 * (samples.B03 - samples.B11)')
    expect(script).toContain('0.25 * samples.B08 + 2.75 * samples.B12')
    expect(script).toContain('ColorRampVisualizer')
    expect(script).toContain('["B03", "B08", "B11", "B12", "dataMask"]')
    expect(script).toContain('0xb3e5fc')
    expect(script).toContain('0x4fc3f7')
    expect(script).toContain('0x053061')
    expect(script).not.toContain('0xa0522d')
    expect(script).not.toContain('0xa6dba0')
    expect(script).toContain('function aweiClass(val)')
    expect(script).toContain('viz.process(cls)')
    expect(script).toContain('concat(samples.dataMask)')
  })

  it('NBR evalscript uses B08/B12 burn ratio', () => {
    const script = buildSentinelIndexColorRampEvalscript('nbr')
    expect(script).toContain('index(samples.B08, samples.B12)')
    expect(script).toContain('ColorRampVisualizer')
  })

  it('MNDWI evalscript uses 10-class tan/brown dry → water blue reclass', () => {
    const script = buildSentinelIndexColorRampEvalscript('mndwi')
    expect(script).toContain('index(samples.B03, samples.B11)')
    expect(script).toContain('ColorRampVisualizer')
    expect(script).toContain('0xa0522d')
    expect(script).toContain('0x053061')
    expect(script).not.toContain('0xffffbf')
    expect(script).not.toContain('0x3e2723')
    expect(script).toContain('function mndwiClass(val)')
    expect(script).toContain('viz.process(cls)')
    expect(script).toContain('concat(samples.dataMask)')
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
    expect(inferWmsEvalProfile('AWEI')).toBe('awei')
    expect(inferWmsEvalProfile('NBR')).toBe('nbr')
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
