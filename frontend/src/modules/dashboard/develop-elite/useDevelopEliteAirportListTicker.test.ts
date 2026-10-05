import { describe, expect, it } from 'vitest'

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
})
