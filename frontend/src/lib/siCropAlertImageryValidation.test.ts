import { describe, expect, it } from 'vitest'
import {
  buildCropAlertImageryContext,
  buildFieldImageryMeta,
  findExactObservationRow,
  formatCropAlertSceneDateReason,
  resolveFieldObservationDate,
  shouldIssueCropHealthAlert,
} from './siCropAlertImageryValidation'

describe('siCropAlertImageryValidation', () => {
  it('buildCropAlertImageryContext warns when fetch date differs from picker', () => {
    const ctx = buildCropAlertImageryContext({
      userRequestedDate: '2026-06-08',
      fetchDate: '2026-06-05',
      latestSceneIso: '2026-06-08',
    })
    expect(ctx.quality).toBe('scene-mismatch')
    expect(ctx.warningMessage).toContain('Older Imagery')
    expect(ctx.imageDate).toBe('2026-06-05')
  })

  it('buildCropAlertImageryContext marks stale scenes outdated', () => {
    const ctx = buildCropAlertImageryContext({
      userRequestedDate: '2026-05-01',
      fetchDate: '2026-05-01',
      latestSceneIso: '2026-06-08',
    })
    expect(ctx.quality).toBe('outdated')
    expect(ctx.warningMessage).toContain('Data Outdated')
  })

  it('findExactObservationRow requires exact calendar day', () => {
    const row = findExactObservationRow(
      [
        { date: '2026-06-05', ndvi: 0.5, ndwi: 0.2, ndmi: 0.3, evi: 0.4 },
        { date: '2026-06-08', ndvi: 0.7, ndwi: 0.3, ndmi: 0.35, evi: 0.45 },
      ],
      '2026-06-08',
    )
    expect(row?.ndvi).toBe(0.7)
    expect(findExactObservationRow([], '2026-06-08')).toBeNull()
  })

  it('buildFieldImageryMeta still allows analysis when daily is empty but catalog has scenes', () => {
    const global = buildCropAlertImageryContext({
      userRequestedDate: '2026-06-08',
      fetchDate: '2026-06-08',
      latestSceneIso: '2026-06-05',
    })
    const meta = buildFieldImageryMeta([], '2026-06-08', global, 'sample', {
      catalogSceneIsos: ['2026-06-05', '2026-05-28'],
    })
    expect(meta.liveVerified).toBe(true)
    expect(meta.imageDate).toBe('2026-06-05')
    expect(meta.dataQuality).not.toBe('no-live-data')
    expect(shouldIssueCropHealthAlert(meta)).toBe(true)
  })

  it('buildFieldImageryMeta verifies exact live observation', () => {
    const global = buildCropAlertImageryContext({
      userRequestedDate: '2026-06-08',
      fetchDate: '2026-06-08',
      latestSceneIso: '2026-06-08',
    })
    const meta = buildFieldImageryMeta(
      [{ date: '2026-06-08', ndvi: 0.7, ndwi: 0.3, ndmi: 0.35, evi: 0.45 }],
      '2026-06-08',
      global,
      'live',
    )
    expect(meta.liveVerified).toBe(true)
    expect(meta.dataSource).toBe('Sentinel Live')
    expect(shouldIssueCropHealthAlert(meta)).toBe(true)
  })

  it('resolveFieldObservationDate falls back to nearest scene on or before fetch date', () => {
    const daily = [
      { date: '2026-06-01', ndvi: 0.7, ndwi: 0.2, ndmi: 0.3, evi: 0.4 },
      { date: '2026-06-05', ndvi: 0.75, ndwi: 0.22, ndmi: 0.32, evi: 0.42 },
    ]
    expect(resolveFieldObservationDate(daily, '2026-06-08')).toBe('2026-06-05')
  })

  it('buildFieldImageryMeta verifies when adaptive fallback finds nearest scene', () => {
    const global = buildCropAlertImageryContext({
      userRequestedDate: '2026-06-08',
      fetchDate: '2026-06-08',
      latestSceneIso: '2026-06-08',
    })
    const meta = buildFieldImageryMeta(
      [{ date: '2026-06-05', ndvi: 0.7, ndwi: 0.3, ndmi: 0.35, evi: 0.45 }],
      '2026-06-08',
      global,
      'live',
      { catalogSceneIsos: ['2026-06-05T10:00:00Z'] },
    )
    expect(meta.liveVerified).toBe(true)
    expect(meta.imageDate).toBe('2026-06-05')
    expect(meta.dataQuality).toBe('scene-mismatch')
    expect(meta.adaptiveResolution?.fallbackUsed).toBe(true)
    expect(shouldIssueCropHealthAlert(meta)).toBe(true)
  })

  it('buildFieldImageryMeta adaptive fallback finds scene after requested date', () => {
    const global = buildCropAlertImageryContext({
      userRequestedDate: '2026-05-25',
      fetchDate: '2026-05-25',
      latestSceneIso: '2026-06-01',
    })
    const meta = buildFieldImageryMeta(
      [{ date: '2026-05-27', ndvi: 0.62, ndwi: 0.2, ndmi: 0.28, evi: 0.4 }],
      '2026-05-25',
      global,
      'live',
    )
    expect(meta.liveVerified).toBe(true)
    expect(meta.imageDate).toBe('2026-05-27')
    expect(meta.adaptiveResolution?.direction).toBe('forward')
  })

  it('buildFieldImageryMeta preferLatestAvailable uses newest scene not nearest to fetch date', () => {
    const global = buildCropAlertImageryContext({
      userRequestedDate: '2026-06-08',
      fetchDate: '2026-06-08',
      latestSceneIso: '2026-06-06',
      autoFollowImagery: true,
    })
    const daily = [
      { date: '2026-06-06', ndvi: 0.82, ndwi: 0.2, ndmi: 0.3, evi: 0.4 },
      { date: '2026-05-30', ndvi: 0.78, ndwi: 0.19, ndmi: 0.29, evi: 0.39 },
    ]
    const meta = buildFieldImageryMeta(daily, '2026-06-08', global, 'live', {
      preferLatestAvailable: true,
    })
    expect(meta.liveVerified).toBe(true)
    expect(meta.imageDate).toBe('2026-06-06')
    expect(meta.dataReason).toBe('No Sentinel data available for current date')
    expect(shouldIssueCropHealthAlert(meta)).toBe(true)
  })

  it('formatCropAlertSceneDateReason uses professional copy', () => {
    expect(formatCropAlertSceneDateReason('2026-06-08', '2026-06-05').summary).toContain('Latest Valid Scene')
    expect(formatCropAlertSceneDateReason('2026-06-08', '2026-06-05').reason).toBe(
      'No Sentinel data available for current date',
    )
  })
})
