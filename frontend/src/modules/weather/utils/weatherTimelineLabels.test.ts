import { describe, expect, it } from 'vitest'
import { findDefaultTimelineIndex } from './weatherTimelineLabels'

describe('findDefaultTimelineIndex', () => {
  it('picks the hour closest to now', () => {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    const series = [
      { time: `${y}-${m}-${d}T00:00` },
      { time: `${y}-${m}-${d}T12:00` },
      { time: `${y}-${m}-${d}T23:00` },
    ]
    const idx = findDefaultTimelineIndex(series)
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(idx).toBeLessThan(series.length)
  })

  it('returns 0 for empty series', () => {
    expect(findDefaultTimelineIndex([])).toBe(0)
  })
})
