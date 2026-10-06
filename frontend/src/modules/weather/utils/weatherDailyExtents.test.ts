import { describe, expect, it } from 'vitest'
import { dailyMinMaxMapFromHourly } from './weatherDailyExtents'

describe('dailyMinMaxMapFromHourly', () => {
  it('computes min and max per calendar day', () => {
    const map = dailyMinMaxMapFromHourly([
      { time: '2025-10-06T08:00', temperatureC: 22 },
      { time: '2025-10-06T18:00', temperatureC: 31 },
      { time: '2025-10-07T09:00', temperatureC: 20 },
    ])
    expect(map.get('2025-10-06')).toEqual({ min: 22, max: 31 })
    expect(map.get('2025-10-07')).toEqual({ min: 20, max: 20 })
  })
})
