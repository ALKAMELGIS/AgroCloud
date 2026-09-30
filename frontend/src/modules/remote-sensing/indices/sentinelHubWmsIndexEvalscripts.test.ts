import { describe, expect, it } from 'vitest'

import {

  buildSentinelIndexColorRampEvalscript,

  sampleSentinelNdviColorMap,

  SENTINEL_NDVI_VEGETATION_GROWTH_RAMP,

} from './sentinelHubWmsIndexEvalscripts'

import { buildSentinelHubWmsAoiClip, inferWmsEvalProfile } from '../imagery/sentinelHubWmsAoiClip'



describe('sentinelHubWmsIndexEvalscripts', () => {

  it('NDVI evalscript uses transparent cloud pixels when 3D extrusion is enabled', () => {
    const script = buildSentinelIndexColorRampEvalscript('ndvi', null, { terrain3dCloudExtrusion: true })
    expect(script).toContain('if (cloudMasked(samples)) return [0, 0, 0, 0];')
    expect(script).not.toContain('return trueColor(samples);')
  })

  it('NDVI evalscript ramps cloud-free pixels and shows real RGB on cloud pixels', () => {

    const script = buildSentinelIndexColorRampEvalscript('ndvi')

    expect(script).toContain('index(samples.B08, samples.B04)')

    for (const band of ['B02', 'B03', 'B04', 'B08', 'SCL', 'CLP', 'dataMask']) {
      expect(script).toContain(`"${band}"`)
    }

    expect(script).not.toContain('"CLM"')

    expect(script).toContain('ColorRampVisualizer')

    expect(script).toContain('visualizer.process(ndvi)')

    expect(script).toContain('imgVals.concat(samples.dataMask)')

    expect(script).toContain('scl == 9 && clp >=')

    expect(script).toContain('scl == 2 || scl == 3 || scl == 4 || scl == 5 || scl == 6 || scl == 7 || scl == 11')

    expect(script).not.toContain('s.CLM == 1')

    expect(script).toContain('if (cloudMasked(samples)) return trueColor(samples);')

    // Cloud test runs before the index so masked pixels never get an index color.
    expect(script.indexOf('return trueColor(samples)')).toBeLessThan(
      script.indexOf('index(samples.B08, samples.B04)'),
    )

    expect(script).toContain('v * 2.5')

    expect(script).not.toContain('imgVals.concat(1)')

    expect(script).not.toContain('function findColor(val)')

    expect(script).not.toContain('function blendRgb')

  })

  it('every index display evalscript routes cloud pixels to true color', () => {
    for (const profile of ['ndvi', 'ndwi', 'ndmi', 'savi', 'evi', 'mndwi', 'awei', 'ndii', 'nbr', 'et', 'lst'] as const) {
      const script = buildSentinelIndexColorRampEvalscript(profile)
      expect(script, profile).toContain('"SCL"')
      expect(script, profile).toContain('"CLP"')
      expect(script, profile).not.toContain('"CLM"')
      expect(script, profile).toContain('function cloudMasked(s)')
      expect(script, profile).toContain('if (cloudMasked(samples)) return trueColor(samples);')
      expect(script, profile).toContain('if (scl == 2 || scl == 3 || scl == 4 || scl == 5 || scl == 6 || scl == 7 || scl == 11) return false')
      expect(script, profile).toContain('if (scl == 9 && clp >=')
    }
  })

  it('NDSI keeps snow pixels in the index and does not treat shadows as clouds', () => {
    const script = buildSentinelIndexColorRampEvalscript('ndsi')
    expect(script).toContain('if (cloudMasked(samples)) return trueColor(samples);')
    expect(script).toContain('scl == 9')
    expect(script).toContain('if (scl == 2 || scl == 3 || scl == 4 || scl == 5 || scl == 6 || scl == 7 || scl == 11) return false')
  })



  it('NDVI growth ramp samples smooth light-to-dark greens for legend and raster parity', () => {

    const greenCh = (hex: number) => (hex >> 8) & 0xff

    const light = sampleSentinelNdviColorMap(0.42)

    const medium = sampleSentinelNdviColorMap(0.57)

    const dark = sampleSentinelNdviColorMap(0.72)

    expect(light).toBe(SENTINEL_NDVI_VEGETATION_GROWTH_RAMP[0]![1])

    expect(greenCh(medium)).toBeLessThan(greenCh(light))

    expect(greenCh(dark)).toBeLessThan(greenCh(medium))

    const stressLow = sampleSentinelNdviColorMap(-0.14)
    const stressMid = sampleSentinelNdviColorMap(0.06)
    const stressHigh = sampleSentinelNdviColorMap(0.14)
    expect(stressLow).toBeLessThan(stressMid)
    expect(stressMid).toBeLessThan(stressHigh)
    expect(sampleSentinelNdviColorMap(0.41)).toBeGreaterThan(0xfff000)

  })



  it('NDWI evalscript uses continuous green-white-blue ColorRampVisualizer', () => {

    const script = buildSentinelIndexColorRampEvalscript('ndwi')

    expect(script).toContain('ColorRampVisualizer')

    expect(script).toContain('index(samples.B03, samples.B08)')

    expect(script).toContain('0x008000')

    expect(script).toContain('0xffffff')

    expect(script).toContain('0x0000cc')

    expect(script).toContain('visualizer.process(val)')

    expect(script).toContain('imgVals.concat(samples.dataMask)')

    expect(script).not.toContain('clearMask')

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

    expect(script).toContain('"SCL"')

    expect(script).not.toContain('clearMask')

    expect(script).not.toContain('ndmiClass')

    expect(script).not.toContain('imgVals.concat(1)')

  })



  it('NDII evalscript uses continuous moisture ramp on B08/B11', () => {

    const script = buildSentinelIndexColorRampEvalscript('ndii')

    expect(script).toContain('ColorRampVisualizer')

    expect(script).toContain('index(samples.B08, samples.B11)')

    expect(script).toContain('"B08"')

    expect(script).toContain('"SCL"')

    expect(script).toContain('viz.process(val)')

    expect(script).not.toContain('clearMask')

    expect(script).not.toContain('ndiiClass')

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

    expect(script).toContain('"B12"')

    expect(script).toContain('"SCL"')

    expect(script).toContain('0xb3e5fc')

    expect(script).toContain('0x4fc3f7')

    expect(script).toContain('0x053061')

    expect(script).not.toContain('0xa0522d')

    expect(script).not.toContain('0xa6dba0')

    expect(script).toContain('function aweiClass(val)')

    expect(script).toContain('viz.process(cls)')

    expect(script).not.toContain('clearMask')

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

    expect(script).not.toContain('clearMask')

  })



  it('SAVI and NDMI profiles are inferred from layer names', () => {

    expect(inferWmsEvalProfile('SAVI')).toBe('savi')

    expect(inferWmsEvalProfile('ET')).toBe('et')

    expect(inferWmsEvalProfile('Evapotranspiration')).toBe('et')

    expect(inferWmsEvalProfile('LST')).toBe('lst')

    expect(inferWmsEvalProfile('Land Surface Temperature')).toBe('lst')

    expect(inferWmsEvalProfile('Moisture index')).toBe('ndmi')

    expect(inferWmsEvalProfile('NDII')).toBe('ndii')

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

