import { describe, expect, it } from 'vitest'
import { resolveAcpFieldSceneComparisonDates } from './acpDecisionSupport'
import type { AcpFieldTableRow } from './acpMapSpatial'

describe('resolveAcpFieldSceneComparisonDates', () => {
  it('prefers ndviSceneDates from API', () => {
    const row = {
      imageDate: '2026-06-10',
      result: { ndviSceneDates: ['2026-06-17', '2026-06-10'] },
    } as AcpFieldTableRow
    expect(resolveAcpFieldSceneComparisonDates(row)).toEqual({
      latestSceneDate: '2026-06-17',
      previousSceneDate: '2026-06-10',
    })
  })

  it('falls back to imageDate when ndviSceneDates missing', () => {
    const row = { imageDate: '2026-06-12' } as AcpFieldTableRow
    expect(resolveAcpFieldSceneComparisonDates(row)).toEqual({
      latestSceneDate: '2026-06-12',
      previousSceneDate: null,
    })
  })
})
