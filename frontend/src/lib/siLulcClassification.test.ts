import { describe, expect, it } from 'vitest'
import {
  buildRemoteSensingLayerSelectGroups,
  flattenRemoteSensingLayerSelectGroups,
  resolveRemoteSensingLayerScientificName,
} from './agroCompositeIndices'
import { inferWmsEvalProfile } from './sentinelHubWmsAoiClip'
import {
  getBootstrapSentinelWmsLayers,
  mergeAgroCloudCustomWmsLayers,
  resolveSentinelHubWmsGetMapLayerName,
  resolveSentinelHubWmsTimeWindow,
  buildSentinelHubWmsGetMapUrlParts,
  usesSentinelHubWmsCustomEvalscript,
} from './sentinelHubWmsLayers'
import { resolveLayerLiveLegendSpec } from './layerLiveLegendCatalog'
import {
  buildLulcClassificationEvalscript,
  buildLulcHistogramEvalscript,
  buildLulcClassIndexWmsEvalscript,
} from './siLulcClassificationEvalscript'
import {
  LULC_AGRICULTURAL_CLASS_IDS,
  LULC_ANALYTICAL_DISPLAY_GSD_M,
  LULC_CLASSES,
  LULC_CLASSIFICATION_LAYER_ID,
  LULC_NATIVE_GSD_M,
  isLulcAgriculturalClassId,
  isLulcClassificationLayerId,
  lulcClassRgb01,
} from './siLulcClassification'

describe('siLulcClassification', () => {
  it('uses IO/Esri class values without 3 or 6', () => {
    const ids = LULC_CLASSES.filter(c => c.id !== 0).map(c => c.id).sort((a, b) => a - b)
    expect(ids).toEqual([1, 2, 4, 5, 7, 8, 9, 10, 11])
    expect(ids).not.toContain(3)
    expect(ids).not.toContain(6)
  })

  it('marks crops and flooded vegetation as agricultural', () => {
    expect(isLulcAgriculturalClassId(5)).toBe(true)
    expect(isLulcAgriculturalClassId(4)).toBe(true)
    expect(isLulcAgriculturalClassId(2)).toBe(false)
    expect(LULC_AGRICULTURAL_CLASS_IDS.size).toBe(2)
  })

  it('targets 3 m analytical display on 10 m native GSD', () => {
    expect(LULC_NATIVE_GSD_M).toBe(10)
    expect(LULC_ANALYTICAL_DISPLAY_GSD_M).toBe(3)
  })

  it('converts hex colors to RGB 0–1 for evalscript', () => {
    const [r, g, b] = lulcClassRgb01('#419BDF')
    expect(r).toBeCloseTo(0.255, 2)
    expect(g).toBeCloseTo(0.608, 2)
    expect(b).toBeCloseTo(0.875, 2)
  })
})

describe('LULC live analysis wiring', () => {
  it('registers LULC in Remote Sensing layer select under Live Analysis', () => {
    const groups = buildRemoteSensingLayerSelectGroups(getBootstrapSentinelWmsLayers())
    const live = groups.find(g => g.id === 'live-analysis-lulc')
    expect(live?.options.some(o => o.id === 'LULC')).toBe(true)
    expect(resolveRemoteSensingLayerScientificName('LULC')).toMatch(/Land Use/i)
    expect(
      flattenRemoteSensingLayerSelectGroups(groups).filter(o => o.id === 'LULC'),
    ).toHaveLength(1)
  })

  it('merges LULC into WMS catalog and uses client evalscript on TRUE_COLOR proxy', () => {
    const merged = mergeAgroCloudCustomWmsLayers([{ name: 'NDVI', title: 'NDVI' }])
    expect(merged.some(l => l.name === LULC_CLASSIFICATION_LAYER_ID)).toBe(true)
    expect(isLulcClassificationLayerId('lulc')).toBe(true)
    expect(usesSentinelHubWmsCustomEvalscript('LULC')).toBe(true)
    expect(inferWmsEvalProfile('LULC')).toBe('lulc_classification')
    expect(resolveSentinelHubWmsGetMapLayerName('LULC', getBootstrapSentinelWmsLayers())).toBe(
      '1_TRUE_COLOR',
    )
  })

  it('uses a 120-day TIME window, NEAREST resampling, and 1024px tiles for LULC', () => {
    expect(resolveSentinelHubWmsTimeWindow('LULC', '2026-06-06', null)).toEqual({
      timeStart: '2026-02-06',
      timeEnd: '2026-06-06',
    })
    const url = buildSentinelHubWmsGetMapUrlParts({
      baseUrl: 'https://example.test/wms',
      layer: '1_TRUE_COLOR',
      timeStart: '2026-02-06',
      timeEnd: '2026-06-06',
      cloudCoverage: 20,
      categorical: true,
      tilePixels: 1024,
    })
    expect(url).toContain('UPSAMPLING=NEAREST')
    expect(url).toContain('DOWNSAMPLING=NEAREST')
    expect(url).toContain('WIDTH=1024')
    expect(url).toContain('HEIGHT=1024')
  })

  it('builds a multi-temporal LULC evalscript with IO class colors', () => {
    const script = buildLulcClassificationEvalscript()
    expect(script).toContain('//VERSION=3')
    expect(script).toContain('mosaicking: "ORBIT"')
    expect(script).toContain('temporal: true')
    expect(script).toContain('B08')
    expect(script).toContain('B11')
    // Crops yellow from LULC_CLASSES (#F5C518)
    expect(script).toMatch(/0\.96[0-9]*,\s*0\.77[0-9]*,\s*0\.09[0-9]*/)
  })

  it('builds a histogram evalscript sharing classifyLulc with trees/crops before flooded', () => {
    const hist = buildLulcHistogramEvalscript()
    expect(hist).toContain('classifyLulc')
    expect(hist).toContain('id: "idx"')
    const treesIdx = hist.indexOf('return 1; // trees')
    const cropsIdx = hist.indexOf('return 3; // crops')
    const floodedIdx = hist.indexOf('return 2; // flooded')
    expect(treesIdx).toBeGreaterThan(0)
    expect(cropsIdx).toBeGreaterThan(treesIdx)
    expect(floodedIdx).toBeGreaterThan(cropsIdx)
  })

  it('builds a WMS class-index evalscript (UINT8) for AOI pixel counts', () => {
    const script = buildLulcClassIndexWmsEvalscript()
    expect(script).toContain('sampleType: "UINT8"')
    expect(script).toContain('classifyLulc')
    expect(script).toContain('return [cls, cls, cls, 255]')
  })

  it('resolves a discrete LULC legend matching Live Analysis classes', () => {
    const spec = resolveLayerLiveLegendSpec('LULC', 'LULC')
    expect(spec?.kind).toBe('discrete')
    expect(spec?.title).toBe('LULC')
    expect(spec?.classes).toHaveLength(LULC_CLASSES.length)
    expect(spec?.classes?.find(c => c.label === 'Crops')?.color).toBe('#F5C518')
    expect(spec?.classes?.find(c => c.label === 'Water')?.color).toBe('#419BDF')
    expect(spec?.note).toMatch(/3m display/)
  })
})
