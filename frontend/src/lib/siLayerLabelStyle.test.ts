import { describe, expect, it } from 'vitest'
import {
  ensureSiLabelPreviewFontsLoaded,
  normalizeSiLayerLabelStyle,
  resolveSiLabelMapboxFontStack,
  SI_LABEL_FONT_FAMILY_OPTIONS,
  siLayerLabelStylePaintSig,
} from './siLayerLabelStyle'

describe('siLayerLabelStyle', () => {
  it('exposes a large font family droplist', () => {
    expect(SI_LABEL_FONT_FAMILY_OPTIONS.length).toBeGreaterThanOrEqual(15)
    expect(SI_LABEL_FONT_FAMILY_OPTIONS.map(o => o.id)).toEqual(
      expect.arrayContaining(['open-sans', 'arial', 'din', 'montserrat', 'playfair']),
    )
  })

  it('normalizes font and colors', () => {
    const s = normalizeSiLayerLabelStyle({
      fieldName: ' NAME ',
      fontFamily: 'montserrat',
      fontSize: 99,
      fontWeight: 'bold',
      fontStyle: 'italic',
      textColor: '#ff0000',
      haloColor: '#00ff00',
      haloWidth: 2,
      minZoom: 12,
      maxZoom: 18,
    })
    expect(s.fieldName).toBe('NAME')
    expect(s.fontFamily).toBe('montserrat')
    expect(s.fontSize).toBe(36)
    expect(s.fontWeight).toBe('bold')
    expect(s.fontStyle).toBe('italic')
    expect(s.textColor).toBe('#ff0000')
    expect(s.minZoom).toBe(12)
    expect(s.maxZoom).toBe(18)
  })

  it('clamps and swaps invalid zoom range', () => {
    const swapped = normalizeSiLayerLabelStyle({ minZoom: 20, maxZoom: 10 })
    expect(swapped.minZoom).toBe(10)
    expect(swapped.maxZoom).toBe(20)
    const same = normalizeSiLayerLabelStyle({ minZoom: 14, maxZoom: 14 })
    expect(same.minZoom).toBe(14)
    expect(same.maxZoom).toBe(15)
  })

  it('falls back unknown fonts to open-sans', () => {
    const s = normalizeSiLayerLabelStyle({ fontFamily: 'not-a-font' })
    expect(s.fontFamily).toBe('open-sans')
  })

  it('resolves mapbox font stacks', () => {
    expect(resolveSiLabelMapboxFontStack({ fontFamily: 'open-sans', fontWeight: 'bold', fontStyle: 'normal' })[0]).toBe(
      'Open Sans Bold',
    )
    expect(resolveSiLabelMapboxFontStack({ fontFamily: 'arial', fontWeight: 'regular', fontStyle: 'normal' })[0]).toBe(
      'Arial Unicode MS Regular',
    )
    expect(resolveSiLabelMapboxFontStack({ fontFamily: 'din', fontWeight: 'regular', fontStyle: 'normal' })[0]).toBe(
      'DIN Offc Pro Regular',
    )
    expect(
      resolveSiLabelMapboxFontStack({ fontFamily: 'playfair', fontWeight: 'bold', fontStyle: 'normal' }),
    ).toContain('Arial Unicode MS Bold')
  })

  it('builds a paint signature', () => {
    expect(
      siLayerLabelStylePaintSig({
        fontFamily: 'lato',
        fontSize: 12,
        fontWeight: 'regular',
        fontStyle: 'normal',
        textColor: '#ffffff',
        haloColor: '#000000',
        haloWidth: 1,
        minZoom: 8,
        maxZoom: 16,
      }),
    ).toMatch(/lato:.*:8:16/)
  })

  it('loads preview fonts stylesheet once', () => {
    document.getElementById('si-layer-label-preview-fonts')?.remove()
    ensureSiLabelPreviewFontsLoaded()
    ensureSiLabelPreviewFontsLoaded()
    expect(document.querySelectorAll('#si-layer-label-preview-fonts')).toHaveLength(1)
  })
})
