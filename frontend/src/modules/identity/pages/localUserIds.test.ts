import { describe, expect, it } from 'vitest'
import { newLocalUserId, resolveLocalUserId, stableIdFromString } from './localUserIds'

describe('localUserIds', () => {
  it('keeps real numeric ids', () => {
    expect(resolveLocalUserId(42)).toBe(42)
    expect(resolveLocalUserId('7')).toBe(7)
  })

  it('gives distinct, stable ids to UUID-only users', () => {
    const a = '4a888c14-0cef-4e8e-b31e-75cd79d7d13d'
    const b = '9b200037-6552-469e-bc59-8db9f9d84ad9'
    expect(resolveLocalUserId(a)).toBe(resolveLocalUserId(a))
    expect(resolveLocalUserId(a)).not.toBe(resolveLocalUserId(b))
    expect(stableIdFromString(a)).toBeGreaterThan(Date.now())
  })

  it('never repeats new ids, even within one millisecond', () => {
    const ids = Array.from({ length: 1000 }, () => newLocalUserId())
    expect(new Set(ids).size).toBe(1000)
    expect(resolveLocalUserId(undefined)).not.toBe(resolveLocalUserId(undefined))
  })
})
