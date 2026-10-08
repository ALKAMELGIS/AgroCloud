import { describe, expect, it } from 'vitest'
import { developEliteMapAllowsPrimaryPointerOrbit } from './developEliteMapLibreOrbit'

describe('developEliteMapLibreOrbit', () => {
  it('allows primary-drag orbit only in 3D above pitch threshold', () => {
    const map = { getPitch: () => 52 } as never
    expect(developEliteMapAllowsPrimaryPointerOrbit(map, true)).toBe(true)
    expect(developEliteMapAllowsPrimaryPointerOrbit(map, false)).toBe(false)
    expect(developEliteMapAllowsPrimaryPointerOrbit({ getPitch: () => 10 } as never, true)).toBe(false)
  })
})
