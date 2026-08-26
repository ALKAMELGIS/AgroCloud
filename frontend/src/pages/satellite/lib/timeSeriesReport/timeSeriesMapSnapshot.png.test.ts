import { describe, expect, it } from 'vitest'
import { isPngBase64Payload, stripBase64Payload } from './timeSeriesMapSnapshot'

/** Minimal 1x1 PNG */
const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

describe('timeSeriesMapSnapshot PNG validation', () => {
  it('detects valid PNG base64 payloads', () => {
    expect(isPngBase64Payload(TINY_PNG_B64)).toBe(true)
    expect(isPngBase64Payload(`data:image/png;base64,${TINY_PNG_B64}`)).toBe(true)
  })

  it('rejects non-image base64', () => {
    expect(isPngBase64Payload('not-valid-base64!!!')).toBe(false)
    expect(isPngBase64Payload('')).toBe(false)
  })

  it('strips data URL prefix and whitespace', () => {
    expect(stripBase64Payload(`  data:image/png;base64, ${TINY_PNG_B64}  `)).toBe(TINY_PNG_B64)
  })
})
