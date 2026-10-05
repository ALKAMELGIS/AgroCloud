import { describe, expect, it } from 'vitest'
import { developEliteSevenSegmentMask, getDevelopEliteUaeClockParts } from './developEliteUaeClock'

describe('getDevelopEliteUaeClockParts', () => {
  it('formats UAE wall time with zero-padded fields', () => {
    const parts = getDevelopEliteUaeClockParts(new Date('2026-10-05T10:30:45Z'))
    expect(parts.hours).toMatch(/^\d{2}$/)
    expect(parts.minutes).toMatch(/^\d{2}$/)
    expect(parts.seconds).toMatch(/^\d{2}$/)
    expect(parts.monthDay).toMatch(/^\d{2}\.\d{2}$/)
    expect(parts.weekdayShort.length).toBeGreaterThan(2)
  })
})

describe('developEliteSevenSegmentMask', () => {
  it('lights all segments for 8', () => {
    expect(developEliteSevenSegmentMask('8').every(Boolean)).toBe(true)
  })

  it('returns off mask for unknown char', () => {
    expect(developEliteSevenSegmentMask('x').some(Boolean)).toBe(false)
  })
})
