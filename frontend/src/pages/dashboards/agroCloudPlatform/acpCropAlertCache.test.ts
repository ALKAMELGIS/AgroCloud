import { describe, expect, it } from 'vitest'
import type { CropAlertResultsCache } from '../../../lib/siCropAlertEngine'
import { isAcpCropAlertResultsValidForReferenceDate } from './acpCropAlertCache'

function stubCache(referenceDate: string): CropAlertResultsCache {
  return {
    referenceDate,
    userRequestedDate: referenceDate,
    imageryContext: {
      userRequestedDate: referenceDate,
      imageDate: referenceDate,
      analysisDate: referenceDate,
      latestSceneDate: null,
      dataSource: 'sentinel-2',
      quality: 'verified',
      warningMessage: null,
    },
    results: [{ fieldKey: 'f1' } as CropAlertResultsCache['results'][0]],
    lastRunAt: Date.now(),
    liveFieldCount: 1,
  }
}

describe('isAcpCropAlertResultsValidForReferenceDate', () => {
  it('returns true when referenceDate matches cache', () => {
    expect(isAcpCropAlertResultsValidForReferenceDate(stubCache('2026-06-17'), '2026-06-17')).toBe(true)
  })

  it('returns false when referenceDate differs', () => {
    expect(isAcpCropAlertResultsValidForReferenceDate(stubCache('2026-06-16'), '2026-06-17')).toBe(false)
  })

  it('returns false for empty cache', () => {
    expect(isAcpCropAlertResultsValidForReferenceDate(null, '2026-06-17')).toBe(false)
  })
})
