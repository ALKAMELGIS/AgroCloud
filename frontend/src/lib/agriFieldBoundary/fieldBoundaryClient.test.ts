import { describe, expect, it } from 'vitest'
import { formatFieldBoundaryUserError } from './fieldBoundaryClient'

describe('fieldBoundaryClient errors', () => {
  it('maps backend_unavailable to friendly offline copy', () => {
    const { short, detail } = formatFieldBoundaryUserError('backend_unavailable')
    expect(short).toMatch(/Loading field model/i)
    expect(detail).toMatch(/AgroCloud API/i)
  })

  it('maps bare HTTP 500 to backend startup guidance', () => {
    const { short } = formatFieldBoundaryUserError('Field boundary detection failed (HTTP 500).')
    expect(short).toMatch(/Field API unavailable/i)
  })
})
