import { describe, expect, it } from 'vitest'
import { countLulcClassPixelsFromRgba } from './siLulcClassAreaWms'
import { LULC_MAP_CLASSES } from './siLulcClassification'

describe('countLulcClassPixelsFromRgba', () => {
  it('counts class index from R channel when alpha is opaque', () => {
    // Water=0, Crops=3, Built=4, Crops=3, transparent skip
    const data = new Uint8ClampedArray([
      0, 0, 0, 255,
      3, 3, 3, 255,
      4, 4, 4, 255,
      3, 3, 3, 255,
      1, 1, 1, 0,
    ])
    const { counts, sampleCount } = countLulcClassPixelsFromRgba(data)
    expect(sampleCount).toBe(4)
    expect(counts[0]).toBe(1)
    expect(counts[3]).toBe(2)
    expect(counts[4]).toBe(1)
    expect(counts).toHaveLength(LULC_MAP_CLASSES.length)
  })
})
