import { describe, expect, it } from 'vitest'
import {
  advanceEoTimelineFraction,
  eoTimelineBlendFromFraction,
  resolveEoWeeklyCompositeIndex,
  stepEoWeeklyCompositeIndex,
  stepEoRollingDateIndex,
} from './siEoTimelinePlayback'

const weekly = [
  { weekIndex: 1, startDate: '2026-06-28', endDate: '2026-07-04' },
  { weekIndex: 2, startDate: '2026-07-05', endDate: '2026-07-11' },
  { weekIndex: 3, startDate: '2026-07-12', endDate: '2026-07-18' },
]

describe('siEoTimelinePlayback', () => {
  it('resolves weekly index from ISO date', () => {
    expect(resolveEoWeeklyCompositeIndex(weekly, '2026-07-08')).toBe(1)
    expect(resolveEoWeeklyCompositeIndex(weekly, '2026-08-01')).toBe(0)
  })

  it('steps weekly index forward and backward with wrap', () => {
    expect(stepEoWeeklyCompositeIndex(weekly, '2026-07-08', 1)).toBe(2)
    expect(stepEoWeeklyCompositeIndex(weekly, '2026-06-28', -1)).toBe(2)
  })

  it('interpolates the two nearest dates while scrubbing', () => {
    expect(eoTimelineBlendFromFraction(1, 0.4)).toEqual({ fromIndex: 0, toIndex: 0, t: 0 })
    expect(eoTimelineBlendFromFraction(5, 0)).toEqual({ fromIndex: 0, toIndex: 1, t: 0 })
    expect(eoTimelineBlendFromFraction(5, 1)).toEqual({ fromIndex: 4, toIndex: 4, t: 0 })
    const mid = eoTimelineBlendFromFraction(5, 0.125)
    expect(mid.fromIndex).toBe(0)
    expect(mid.toIndex).toBe(1)
    expect(mid.t).toBeCloseTo(0.5)
  })

  it('advances the playhead through dates without stopping on an index', () => {
    const stepMs = 1000
    const gaps = 4
    expect(advanceEoTimelineFraction(0, 5, stepMs / 2, stepMs)).toBeCloseTo(0.5 / gaps)
    expect(advanceEoTimelineFraction(0, 5, stepMs, stepMs)).toBeCloseTo(1 / gaps)
    const wrapped = advanceEoTimelineFraction(0.9, 5, stepMs * gaps, stepMs)
    expect(wrapped).toBeGreaterThanOrEqual(0)
    expect(wrapped).toBeLessThan(1)
    expect(Number.isInteger(advanceEoTimelineFraction(0, 5, stepMs / 2, stepMs))).toBe(false)
  })

  it('steps rolling date strip', () => {
    const d0 = new Date(2026, 6, 1)
    const d1 = new Date(2026, 6, 2)
    const dates = [{ full: d0 }, { full: d1 }]
    expect(stepEoRollingDateIndex(dates, d0, 1)).toBe(1)
    expect(stepEoRollingDateIndex(dates, d1, -1)).toBe(0)
  })
})
