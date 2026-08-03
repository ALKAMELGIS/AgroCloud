import { describe, expect, it } from 'vitest'
import { clampChirpsSeriesWindow } from '../../pages/satellite/components/useChirpsPrecipitation'

describe('clampChirpsSeriesWindow', () => {
  it('clamps daily windows longer than 120 days to the latest 120', () => {
    const out = clampChirpsSeriesWindow({
      start: '2026-01-01',
      end: '2026-07-28',
      aggregation: 'daily',
    })
    expect(out.clamped).toBe(true)
    expect(out.end).toBe('2026-07-28')
    expect(out.start).toBe('2026-03-31')
    expect(out.note).toMatch(/120/)
  })

  it('leaves short daily windows unchanged', () => {
    const out = clampChirpsSeriesWindow({
      start: '2026-07-01',
      end: '2026-07-28',
      aggregation: 'daily',
    })
    expect(out.clamped).toBe(false)
    expect(out.start).toBe('2026-07-01')
    expect(out.end).toBe('2026-07-28')
  })
})
