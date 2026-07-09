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

  it('resolves NDMI with 10 classes', () => {
    const spec = resolveLayerLiveLegendSpec('NDMI', 'NDMI')
    expect(spec?.title).toBe('NDMI')
    expect(spec?.classes).toHaveLength(10)
    expect(spec?.gradientCss).toContain('linear-gradient')
  })

  it('resolves NDWI with dual-ramp classes', () => {
    const spec = resolveLayerLiveLegendSpec('NDWI', 'NDWI')
    expect(spec?.classes).toHaveLength(10)
    expect(spec?.classes?.[0]?.color).toMatch(/^#/)
  })

  it('resolves NDVI with 10 classes', () => {
    const spec = resolveLayerLiveLegendSpec('NDVI', 'NDVI')
    expect(spec?.classes).toHaveLength(10)
    expect(spec?.gradientCss).toContain('linear-gradient')
  })

  it('resolves NDSI snow index with the 10-step blue snow ramp', () => {
    const spec = resolveLayerLiveLegendSpec('NDSI', 'NDSI')
    expect(spec?.title).toBe('NDSI')
    expect(spec?.classes).toHaveLength(10)
    expect(spec?.classes?.[0]?.color).toBe('#4a4a4a')
    expect(spec?.classes?.[9]?.color).toBe('#ffffff')
    expect(spec?.classes?.[4]?.color).toBe('#29b6f6')
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
