import { describe, expect, it } from 'vitest'
import { formatFieldBoundaryUserError } from './fieldBoundaryClient'

describe('fieldBoundaryClient errors', () => {
  it('maps backend_unavailable to friendly offline copy', () => {
    const { short, detail } = formatFieldBoundaryUserError('backend_unavailable')
    expect(short).toMatch(/Loading field model/i)
    expect(detail).toMatch(/AgroCloud API/i)
  })
})
