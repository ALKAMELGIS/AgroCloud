import { describe, expect, it } from 'vitest'
import {
  isBuiltinFieldEngine,
  isMapRgbOnlyProductionHost,
  shouldSkipFootprintRegularize,
} from './fieldBoundaryProductionMode'

describe('fieldBoundaryProductionMode', () => {
  it('detects builtin spectral engine', () => {
    expect(isBuiltinFieldEngine('spectral-builtin')).toBe(true)
    expect(isBuiltinFieldEngine('ftw-live')).toBe(false)
  })

  it('always regularizes footprints (builtin uses softer thresholds in finishResult)', () => {
    expect(shouldSkipFootprintRegularize('spectral-builtin')).toBe(false)
    expect(shouldSkipFootprintRegularize('delineate-anything')).toBe(false)
  })

  it('marks Hostinger health as map RGB only', () => {
    expect(
      isMapRgbOnlyProductionHost({
        status: 'ok',
        python: false,
        ftw_live: false,
        ftw_infer: false,
        builtin_fallback: true,
      }),
    ).toBe(true)
    expect(
      isMapRgbOnlyProductionHost({
        status: 'ok',
        python: true,
        ftw_live: true,
      }),
    ).toBe(false)
  })
})
