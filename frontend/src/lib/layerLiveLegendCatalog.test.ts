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
    expect(spec?.classes?.[4]?.label).toBe('Dry canopy')
    expect(spec?.classes?.[5]?.label).toBe('Moist canopy')
    // Dry half: yellow → orange → red → dark red; moist half: light blue → dark blue
    expect(spec?.classes?.[4]?.color.toLowerCase()).toBe('#ffeb3b')
    expect(spec?.classes?.[3]?.color.toLowerCase()).toBe('#fb8c00')
    expect(spec?.classes?.[0]?.color.toLowerCase()).toBe('#7f0000')
    expect(spec?.classes?.[5]?.color.toLowerCase()).toBe('#81d4fa')
    expect(spec?.classes?.[9]?.color.toLowerCase()).toBe('#0d47a1')
  })

  it('resolves NDWI with 10 soil→water classes', () => {
    const spec = resolveLayerLiveLegendSpec('NDWI', 'NDWI')
    expect(spec?.classes).toHaveLength(10)
    expect(spec?.classes?.[0]?.label).toBe('Very dry')
    expect(spec?.classes?.[3]?.label).toBe('Slightly dry')
    expect(spec?.classes?.[9]?.label).toBe('Open water')
    // Dry half: dark red → red → orange → yellow
    expect(spec?.classes?.[0]?.color.toLowerCase()).toBe('#7f0000')
    expect(spec?.classes?.[1]?.color.toLowerCase()).toBe('#d32f2f')
    expect(spec?.classes?.[2]?.color.toLowerCase()).toBe('#fb8c00')
    expect(spec?.classes?.[3]?.color.toLowerCase()).toBe('#ffeb3b')
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
