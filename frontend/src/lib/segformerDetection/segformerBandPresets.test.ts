import { describe, expect, it } from 'vitest'
import {
  getSegFormerBand,
  isTrueColorRgbMapping,
  normalizeSegFormerRgbMapping,
  resolveSegFormerRgbComposite,
  SEGFORMER_BAND_MODE_OPTIONS,
  SEGFORMER_DEFAULT_BAND_CONFIG,
  SEGFORMER_FALSE_COLOR_VEG_RGB,
  SEGFORMER_S2_BAND_IDS,
  SEGFORMER_S2_BANDS,
  SEGFORMER_TRUE_COLOR_RGB,
  segFormerRgbMappingKey,
} from './segformerBandPresets'

describe('segformerBandPresets', () => {
  it('lists the Sentinel-2 bands from the workspace spec', () => {
    expect(SEGFORMER_S2_BAND_IDS).toEqual(['B02', 'B03', 'B04', 'B05', 'B08', 'B11', 'B12'])
    expect(SEGFORMER_S2_BANDS).toHaveLength(7)
    expect(getSegFormerBand('B04')?.label).toBe('Red')
    expect(getSegFormerBand('B08')?.label).toBe('NIR')
  })

  it('defaults to RGB True Color (B04/B03/B02)', () => {
    expect(SEGFORMER_DEFAULT_BAND_CONFIG.mode).toBe('rgb')
    expect(SEGFORMER_TRUE_COLOR_RGB).toEqual({ r: 'B04', g: 'B03', b: 'B02' })
    expect(isTrueColorRgbMapping(SEGFORMER_TRUE_COLOR_RGB)).toBe(true)
    expect(segFormerRgbMappingKey(SEGFORMER_TRUE_COLOR_RGB)).toBe('B04-B03-B02')
  })

  it('exposes rgb / multispectral / custom modes', () => {
    expect(SEGFORMER_BAND_MODE_OPTIONS.map((m) => m.id)).toEqual([
      'rgb',
      'multispectral',
      'custom',
    ])
  })

  it('resolves rgb and multispectral to True Color for ADE20K inference', () => {
    expect(resolveSegFormerRgbComposite({ mode: 'rgb', customRgb: SEGFORMER_FALSE_COLOR_VEG_RGB })).toEqual(
      SEGFORMER_TRUE_COLOR_RGB,
    )
    expect(
      resolveSegFormerRgbComposite({
        mode: 'multispectral',
        customRgb: SEGFORMER_FALSE_COLOR_VEG_RGB,
      }),
    ).toEqual(SEGFORMER_TRUE_COLOR_RGB)
  })

  it('resolves custom mode to the user RGB mapping', () => {
    expect(
      resolveSegFormerRgbComposite({
        mode: 'custom',
        customRgb: SEGFORMER_FALSE_COLOR_VEG_RGB,
      }),
    ).toEqual(SEGFORMER_FALSE_COLOR_VEG_RGB)
  })

  it('normalizes invalid custom band ids onto True Color fallbacks', () => {
    expect(
      normalizeSegFormerRgbMapping({ r: 'B99' as 'B04', g: 'B03', b: 'B02' }),
    ).toEqual({ r: 'B04', g: 'B03', b: 'B02' })
  })
})
