import { describe, expect, it } from 'vitest'
import {
  ftwInferenceCropYear,
  ftwInferenceEffectiveSceneDate,
  ftwInferenceSafeSceneRange,
} from './ftwInferenceSceneDate'

describe('ftwInferenceSceneDate', () => {
  const now = new Date('2026-08-30T12:00:00Z')

  it('defaults to previous crop year mid-season', () => {
    expect(ftwInferenceSafeSceneRange(now)).toEqual({ from: '2025-06-15', to: '2025-06-15' })
  })

  it('snaps current-year scene dates to previous year (same month-day)', () => {
    expect(ftwInferenceEffectiveSceneDate('2026-08-28', now)).toBe('2025-08-28')
    expect(ftwInferenceCropYear('2026-08-28', now)).toBe(2025)
  })

  it('keeps prior-year scene dates unchanged', () => {
    expect(ftwInferenceEffectiveSceneDate('2024-07-01', now)).toBe('2024-07-01')
    expect(ftwInferenceCropYear('2024-07-01', now)).toBe(2024)
  })
})
