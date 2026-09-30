import { describe, expect, it } from 'vitest'
import { defaultSwipeBeforeDate } from './siMapSwipeTiles'

describe('siMapSwipeTiles', () => {
  it('defaults before date to 14 days earlier', () => {
    expect(defaultSwipeBeforeDate('2026-08-10')).toBe('2026-07-27')
  })

  it('returns empty for blank after date', () => {
    expect(defaultSwipeBeforeDate('')).toBe('')
  })
})
