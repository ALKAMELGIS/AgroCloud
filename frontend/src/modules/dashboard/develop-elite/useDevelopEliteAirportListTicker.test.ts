import { describe, expect, it } from 'vitest'
import { developEliteAirportTickerRows } from './useDevelopEliteAirportListTicker'

function listMaxScroll(scrollHeight: number, clientHeight: number): number {
  return Math.max(0, scrollHeight - clientHeight)
}

describe('develop elite list ticker scroll range', () => {
  it('returns positive scroll range when content overflows', () => {
    expect(listMaxScroll(400, 120)).toBe(280)
  })

  it('returns zero when content fits', () => {
    expect(listMaxScroll(100, 120)).toBe(0)
  })

  it('duplicates rows for airport loop while ticker is active', () => {
    const rows = [{ id: 'a' }, { id: 'b' }]
    expect(developEliteAirportTickerRows(rows, false)).toHaveLength(2)
    expect(developEliteAirportTickerRows(rows, true)).toHaveLength(4)
  })
})
