import { describe, expect, it } from 'vitest'
import {
  buildLayerLiveLegendList,
  hexNumberToCss,
  resolveLayerLiveLegendSpec,
} from './layerLiveLegendCatalog'

describe('layerLiveLegendCatalog', () => {
  it('formats hex colors for CSS', () => {
    expect(hexNumberToCss(0x008000)).toBe('#008000')
    expect(hexNumberToCss(0x0000cc)).toBe('#0000cc')
  })

  it('resolves NDMI with 10 named stress→moisture classes aligned to AOI area bins', () => {
    const spec = resolveLayerLiveLegendSpec('NDMI', 'NDMI')
    expect(spec?.title).toBe('NDMI')
    expect(spec?.classes).toHaveLength(10)
    expect(spec?.gradientCss).toContain('linear-gradient')
    expect(spec?.classes?.[0]?.label).toBe('Severe moisture stress')
    expect(spec?.classes?.[3]?.label).toBe('Low moisture stress')
    expect(spec?.classes?.[5]?.label).toBe('Moist canopy')
    expect(spec?.classes?.[8]?.label).toBe('Moister canopy')
    expect(spec?.classes?.[9]?.label).toBe('Saturated moist')
    expect(spec?.classes?.[0]?.color.toLowerCase()).toBe('#800000')
    expect(spec?.classes?.[3]?.color.toLowerCase()).toBe('#ffff00')
    expect(spec?.classes?.[5]?.color.toLowerCase()).toBe('#b3e5fc')
    expect(spec?.classes?.[8]?.color.toLowerCase()).toBe('#0288d1')
    expect(spec?.classes?.[9]?.color.toLowerCase()).toBe('#000080')
    expect(spec?.classes?.[1]?.rangeLabel).toBe('-0.64 – -0.48')
  })

  it('resolves DSI with 10 drought severity classes', () => {
    const spec = resolveLayerLiveLegendSpec('DSI', 'DSI')
    expect(spec?.title).toBe('DSI')
    expect(spec?.classes).toHaveLength(10)
    expect(spec?.classes?.[0]?.label).toBe('No Drought')
    expect(spec?.classes?.[9]?.label).toBe('Extreme Drought')
    expect(spec?.classes?.[0]?.rangeLabel).toBe('0.00–0.10')
    expect(spec?.classes?.[3]?.rangeLabel).toBe('0.30–0.40')
    expect(spec?.classes?.[9]?.rangeLabel).toBe('0.90–1.00')
    expect(spec?.classes?.[0]?.color.toLowerCase()).toBe('#006837')
    expect(spec?.classes?.[9]?.color.toLowerCase()).toBe('#7f0000')
    expect(spec?.note).toContain('Drought Area')
  })

  it('resolves NBR with 10 named burn-severity classes aligned to AOI area bins', () => {
    const spec = resolveLayerLiveLegendSpec('NBR', 'NBR')
    expect(spec?.title).toBe('NBR')
    expect(spec?.classes).toHaveLength(10)
    expect(spec?.classes?.[0]?.label).toBe('Severe burn')
    expect(spec?.classes?.[4]?.label).toBe('Low severity burn')
    expect(spec?.classes?.[5]?.label).toBe('Unburned / regrowth')
    expect(spec?.classes?.[9]?.label).toBe('Dense unburned vegetation')
    expect(spec?.classes?.[0]?.rangeLabel).toBe('< -0.35')
    expect(spec?.classes?.[1]?.rangeLabel).toBe('-0.35 – -0.20')
    expect(spec?.classes?.[9]?.rangeLabel).toBe('≥ 0.85')
  })

  it('resolves NDWI with 10 named dry→water classes aligned to AOI area bins', () => {
    const spec = resolveLayerLiveLegendSpec('NDWI', 'NDWI')
    expect(spec?.classes).toHaveLength(10)
    expect(spec?.classes?.[0]?.label).toBe('Extremely dry / non-water')
    expect(spec?.classes?.[4]?.label).toBe('Moist surface')
    expect(spec?.classes?.[5]?.label).toBe('Slightly wet surface')
    expect(spec?.classes?.[9]?.label).toBe('Deep / permanent water')
    expect(spec?.classes?.[0]?.color.toLowerCase()).toBe('#006400')
    expect(spec?.classes?.[5]?.color.toLowerCase()).toBe('#b3e5fc')
    expect(spec?.classes?.[9]?.color.toLowerCase()).toBe('#000080')
    expect(spec?.classes?.[5]?.rangeLabel).toBe('0.000 – 0.16')
  })

  it('resolves NDVI with 10 classes', () => {
    const spec = resolveLayerLiveLegendSpec('NDVI', 'NDVI')
    expect(spec?.classes).toHaveLength(10)
    expect(spec?.gradientCss).toContain('linear-gradient')
  })

  it('resolves NDSI salinity index with the 10-step soil salinity ramp', () => {
    const spec = resolveLayerLiveLegendSpec('NDSI', 'NDSI')
    expect(spec?.title).toBe('NDSI')
    expect(spec?.kind).toBe('discrete')
    expect(spec?.classes).toHaveLength(10)
    expect(spec?.subtitle).toMatch(/salinity/i)
    expect(spec?.classes?.[0]?.label).toContain('Non-saline')
    expect(spec?.classes?.[9]?.label).toContain('Extreme salinity')
    expect(spec?.classes?.[0]?.color).toBe('#1b5e20')
    expect(spec?.classes?.[9]?.color).toBe('#7f0000')
  })

  it('resolves LULC live analysis discrete legend', () => {
    const spec = resolveLayerLiveLegendSpec('LULC', 'LULC')
    expect(spec?.kind).toBe('discrete')
    expect(spec?.classes?.some(c => c.label === 'Crops')).toBe(true)
    expect(spec?.classes?.some(c => c.label === 'Built Area')).toBe(true)
    expect(spec?.note).toMatch(/3m/)
  })

  it('resolves true color and SAR layers', () => {
    expect(resolveLayerLiveLegendSpec('TRUE_COLOR', 'True Color')?.kind).toBe('composite')
    expect(resolveLayerLiveLegendSpec('VV', 'VV - decibel gamma0')?.kind).toBe('sar')
    expect(resolveLayerLiveLegendSpec('SCL', 'Scene classification map')?.classes?.length).toBe(12)
  })

  it('builds deduped legend list from layer options', () => {
    const list = buildLayerLiveLegendList([
      { id: 'NDVI', label: 'NDVI' },
      { id: 'NDMI', label: 'NDMI' },
      { id: 'NDWI', label: 'NDWI' },
    ])
    expect(list.length).toBe(3)
  })

  it('resolves composite VDI with 10 discrete classes', () => {
    const spec = resolveLayerLiveLegendSpec('VDI', 'VDI')
    expect(spec?.kind).toBe('discrete')
    expect(spec?.classes).toHaveLength(10)
    expect(spec?.subtitle).toContain('dryness')
    expect(spec?.classes?.[0]?.color).toBe('#2e7d32')
    expect(spec?.classes?.[9]?.color).toBe('#4e342e')
  })

  it('resolves delta DIEI with 10 change classes', () => {
    const spec = resolveLayerLiveLegendSpec('DIEI', 'ΔIEI')
    expect(spec?.classes).toHaveLength(10)
    expect(spec?.subtitle).toContain('ΔIEI')
  })

  it('resolves CVHI composite classification with red-to-green ramp', () => {
    const spec = resolveLayerLiveLegendSpec('CVHI', 'CVHI')
    expect(spec?.kind).toBe('discrete')
    expect(spec?.classes).toHaveLength(10)
    expect(spec?.valueMin).toBe(-1)
    expect(spec?.valueMax).toBe(1)
    expect(spec?.classes?.[0]?.label).toContain('Extreme Vegetation Stress')
    expect(spec?.classes?.[9]?.label).toContain('Excellent Vegetation Health')
    expect(spec?.subtitle).toContain('composite')
  })

  it('resolves CHAS with 10-class scientific raster legend', () => {
    const spec = resolveLayerLiveLegendSpec('CHAS', 'CHAS')
    expect(spec?.classes).toHaveLength(10)
    expect(spec?.subtitle).toContain('10-class')
    expect(spec?.note).toContain('NDVI')
    expect(spec?.note).toContain('SAVI')
    expect(spec?.classes?.[0]?.label).toContain('Class 1')
  })

  it('resolves CHAS_ALERT with 4 derived alert levels', () => {
    const spec = resolveLayerLiveLegendSpec('CHAS_ALERT', 'CHAS Alert')
    expect(spec?.classes).toHaveLength(4)
    expect(spec?.classes?.[0]?.label).toBe('CRITICAL')
    expect(spec?.classes?.[3]?.label).toBe('SAFE')
    expect(spec?.note).toContain('Derived from CHAS')
  })
})
