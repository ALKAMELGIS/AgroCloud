import { describe, expect, it } from 'vitest'
import { isClassAreaAbortError } from './useLayerClassAreas'

describe('isClassAreaAbortError', () => {
  it('detects DOMException AbortError', () => {
    expect(isClassAreaAbortError(new DOMException('The operation was aborted.', 'AbortError'))).toBe(true)
  })

  it('detects AbortError by name/message', () => {
    const err = new Error('signal is aborted without reason')
    err.name = 'AbortError'
    expect(isClassAreaAbortError(err)).toBe(true)
    expect(isClassAreaAbortError(new Error('signal is aborted without reason'))).toBe(true)
  })

  it('ignores real failures', () => {
    expect(isClassAreaAbortError(new Error('Failed to compute class areas'))).toBe(false)
    expect(isClassAreaAbortError(null)).toBe(false)
  })
})
