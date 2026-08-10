import { describe, expect, it } from 'vitest'
import {
  formatLayerSelectScienceLabel,
  stripLayerSelectFormulas,
} from './remoteSensingLayerDisplay'

describe('remoteSensingLayerDisplay', () => {
  it('keeps practical NDVI name', () => {
    expect(stripLayerSelectFormulas('Normalized Difference Vegetation Index')).toBe(
      'Normalized Difference Vegetation Index',
    )
  })

  it('strips mangrove band formulas, keeps practical wording', () => {
    expect(
      stripLayerSelectFormulas(
        'Mangrove Vegetation Index — (B08−B03)/(B11−B03) · mangrove detection',
      ),
    ).toBe('Mangrove Vegetation Index · mangrove detection')
  })

  it('strips CI-RE ratio formula', () => {
    expect(
      stripLayerSelectFormulas(
        'Chlorophyll Index Red Edge — (B8A/B05)−1 · sensitive to chlorophyll content',
      ),
    ).toBe('Chlorophyll Index Red Edge · sensitive to chlorophyll content')
  })

  it('strips INDEX = formula catalogs to acronym only (then format hides vs label)', () => {
    expect(stripLayerSelectFormulas('NDVI = (NIR − Red) / (NIR + Red)')).toBe('NDVI')
    expect(formatLayerSelectScienceLabel('NDVI = (NIR − Red) / (NIR + Red)', 'NDVI')).toBe('')
  })

  it('strips gold weight recipe', () => {
    expect(
      stripLayerSelectFormulas(
        'Gold Composite Index · 0.30(IOI) + 0.25(CMI) + 0.20(FMI) + 0.15(NDAI) + 0.10(BSI)',
      ),
    ).toBe('Gold Composite Index')
  })

  it('strips REIP wavelength formula', () => {
    expect(
      stripLayerSelectFormulas(
        'Red Edge Inflection Point — 705+35×(((B04+B07)/2−B05)/(B06−B05)) · Guyot & Baret · chlorophyll / condition',
      ),
    ).toContain('Red Edge Inflection Point')
    expect(
      stripLayerSelectFormulas(
        'Red Edge Inflection Point — 705+35×(((B04+B07)/2−B05)/(B06−B05)) · Guyot & Baret · chlorophyll / condition',
      ),
    ).not.toMatch(/705|B04|B06/)
  })
})
