import { describe, expect, it } from 'vitest'
import { resolveSiScopedSessionKey, resolveSiScopedStorageKey } from './siInstanceScope'
import { isCropAlertCacheEventForKey, SI_CROP_ALERT_RESULTS_LS_KEY } from '@/modules/remote-sensing/indices/siCropAlertEngine'

describe('siInstanceScope', () => {
  it('returns base keys unchanged for standalone scope', () => {
    expect(resolveSiScopedStorageKey('si_crop_alert_results_v6', 'standalone')).toBe(
      'si_crop_alert_results_v6',
    )
    expect(resolveSiScopedSessionKey('si-crop-alert-sentinel-series-v1', 'standalone')).toBe(
      'si-crop-alert-sentinel-series-v1',
    )
  })

  it('prefixes develop-elite scoped keys', () => {
    expect(resolveSiScopedStorageKey('si-its-float-pos-v3', 'develop-elite')).toBe(
      'de:si-its-float-pos-v3',
    )
  })
})

describe('isCropAlertCacheEventForKey', () => {
  it('matches only the intended results key', () => {
    const standaloneEvent = new CustomEvent('test', {
      detail: { resultsKey: SI_CROP_ALERT_RESULTS_LS_KEY },
    })
    expect(isCropAlertCacheEventForKey(standaloneEvent, SI_CROP_ALERT_RESULTS_LS_KEY)).toBe(true)
    expect(isCropAlertCacheEventForKey(new Event('test'), SI_CROP_ALERT_RESULTS_LS_KEY)).toBe(true)
    expect(isCropAlertCacheEventForKey(new Event('test'), 'other-key')).toBe(false)
  })
})
