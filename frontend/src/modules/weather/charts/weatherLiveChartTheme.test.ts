import { describe, expect, it } from 'vitest'
import { formatArcgisAxisTick } from './weatherLiveChartTheme'

describe('formatArcgisAxisTick', () => {
  it('shows date at midnight on a new day', () => {
    expect(formatArcgisAxisTick('2025-10-06T00:00')).toMatch(/Oct\s+6/)
  })

  it('shows date and time when the day changes mid-series', () => {
    const prev = '2025-10-06T21:00'
    const tick = formatArcgisAxisTick('2025-10-07T03:00', prev)
    expect(tick).toMatch(/Oct\s+7/)
    expect(tick).toMatch(/03:00/)
  })

  it('shows time only on the same calendar day', () => {
    const prev = '2025-10-06T09:00'
    expect(formatArcgisAxisTick('2025-10-06T15:00', prev)).toBe('15:00')
  })
})
