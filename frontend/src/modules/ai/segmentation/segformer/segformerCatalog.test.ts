import { describe, expect, it } from 'vitest'
import {
  getSegFormerAde20kIndices,
  getSegFormerDefaultMinConfidence,
  isSegFormerSpectralFallbackClass,
  SEGFORMER_AG_MIN_CONFIDENCE,
  SEGFORMER_DEFAULT_MIN_CONFIDENCE,
} from './segformerCatalog'

describe('segformerCatalog agriculture mapping', () => {
  it('uses field-only ADE20K (29) for Agricultural Field pipeline', () => {
    expect(getSegFormerAde20kIndices(1)).toEqual([29])
  })

  it('keeps broader ADE20K proxies for other core agriculture classes', () => {
    for (const classId of [2, 5, 6, 7]) {
      const indices = getSegFormerAde20kIndices(classId)
      expect(indices).toContain(29) // field
      expect(indices.length).toBeGreaterThan(1)
      expect(indices.some((i) => i === 13 || i === 9 || i === 17)).toBe(true)
    }
    expect(getSegFormerAde20kIndices(6)).toContain(21) // irrigated keeps water
  })

  it('uses lower default confidence for agriculture and trees', () => {
    expect(getSegFormerDefaultMinConfidence('agriculture')).toBe(SEGFORMER_AG_MIN_CONFIDENCE)
    expect(getSegFormerDefaultMinConfidence('trees')).toBe(SEGFORMER_AG_MIN_CONFIDENCE)
    expect(getSegFormerDefaultMinConfidence(1)).toBe(SEGFORMER_AG_MIN_CONFIDENCE)
    expect(getSegFormerDefaultMinConfidence('buildings')).toBe(SEGFORMER_DEFAULT_MIN_CONFIDENCE)
    expect(getSegFormerDefaultMinConfidence(40)).toBe(SEGFORMER_DEFAULT_MIN_CONFIDENCE)
  })

  it('marks agriculture and trees for spectral empty-result fallback', () => {
    expect(isSegFormerSpectralFallbackClass(1)).toBe(true)
    expect(isSegFormerSpectralFallbackClass(20)).toBe(true)
    expect(isSegFormerSpectralFallbackClass(40)).toBe(false)
    expect(isSegFormerSpectralFallbackClass(70)).toBe(false)
  })
})
