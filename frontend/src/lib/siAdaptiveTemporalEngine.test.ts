import { describe, expect, it } from 'vitest'
import {
  resolveAdaptiveFieldObservationDate,
  resolveAdaptiveSceneDate,
  resolveAutoLatestValidSceneDate,
  resolveAutoLiveScenePair,
  resolveNearestValidSceneDate,
  resolvePreviousValidSceneDate,
} from './siAdaptiveTemporalEngine'

describe('siAdaptiveTemporalEngine', () => {
  it('resolveAdaptiveSceneDate picks temporally nearest scene within fallback window', () => {
    const candidates = ['2026-05-27', '2026-05-20', '2026-06-03']
    const backward = resolveAdaptiveSceneDate('2026-06-01', candidates)
    expect(backward.resolvedDate).toBe('2026-06-03')
    expect(backward.direction).toBe('forward')

    const forward = resolveAdaptiveSceneDate('2026-05-25', ['2026-05-27', '2026-05-20'])
    expect(forward.resolvedDate).toBe('2026-05-27')
    expect(forward.direction).toBe('forward')
  })

  it('resolveNearestValidSceneDate picks temporally closest scene', () => {
    const available = ['2026-06-05', '2026-06-03', '2026-06-01']
    expect(resolveNearestValidSceneDate('2026-06-06', available)).toBe('2026-06-05')
    expect(resolveNearestValidSceneDate('2026-05-30', available)).toBe('2026-06-01')
  })

  it('resolveAdaptiveFieldObservationDate uses daily statistical series', () => {
    const daily = [
      { date: '2026-05-27', ndvi: 0.67, ndwi: 0.2, ndmi: 0.3, evi: 0.4 },
      { date: '2026-05-20', ndvi: 0.82, ndwi: 0.22, ndmi: 0.32, evi: 0.42 },
      { date: '2026-05-15', ndvi: 0.88, ndwi: 0.24, ndmi: 0.34, evi: 0.44 },
    ]
    const resolution = resolveAdaptiveFieldObservationDate(daily, '2026-06-01')
    expect(resolution.resolvedDate).toBe('2026-05-27')
    expect(resolution.fallbackUsed).toBe(true)
  })
})

describe('Auto Live Date', () => {
  const catalog = ['2026-06-08', '2026-06-06', '2026-05-30', '2026-05-20']
  const now = new Date(2026, 5, 8, 12, 0, 0)

  it('resolveAutoLatestValidSceneDate picks latest scene on or before today', () => {
    expect(resolveAutoLatestValidSceneDate(catalog, now)).toBe('2026-06-08')
  })

  it('resolvePreviousValidSceneDate returns temporally previous scene', () => {
    expect(resolvePreviousValidSceneDate('2026-06-06', catalog)).toBe('2026-05-30')
    expect(resolvePreviousValidSceneDate('2026-06-08', catalog)).toBe('2026-06-06')
  })

  it('resolveAutoLiveScenePair matches user example when latest days have no data in catalog', () => {
    const sparse = ['2026-06-06', '2026-05-30', '2026-05-15']
    const pair = resolveAutoLiveScenePair(sparse, now)
    expect(pair.currentSceneDate).toBe('2026-06-06')
    expect(pair.previousSceneDate).toBe('2026-05-30')
  })
})
