import { describe, expect, it } from 'vitest'
import { parseLocalDateTime } from './developEliteHeaderDateTimeFormat'

describe('parseLocalDateTime', () => {
  it('parses local date and time', () => {
    const d = parseLocalDateTime('2026-10-02', '16:30')
    expect(d).not.toBeNull()
    expect(d!.getFullYear()).toBe(2026)
    expect(d!.getMonth()).toBe(9)
    expect(d!.getDate()).toBe(2)
    expect(d!.getHours()).toBe(16)
    expect(d!.getMinutes()).toBe(30)
  })
})
