import { describe, expect, it } from 'vitest'
import {
  eoTimelineFractionFromIndex,
  eoTimelineIndexFromFraction,
} from './EoTimelineSlider'

describe('EoTimelineSlider math', () => {
  it('maps fraction to discrete index', () => {
    expect(eoTimelineIndexFromFraction(0, 5)).toBe(0)
    expect(eoTimelineIndexFromFraction(1, 5)).toBe(4)
    expect(eoTimelineIndexFromFraction(0.5, 5)).toBe(2)
  })

  it('maps index to fraction', () => {
    expect(eoTimelineFractionFromIndex(0, 5)).toBe(0)
    expect(eoTimelineFractionFromIndex(4, 5)).toBe(1)
  })
})
