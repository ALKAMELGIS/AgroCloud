import { describe, expect, it } from 'vitest'
import {
  bboxRefKey,
  createFrameThrottle,
  mapMetricsChangedEnough,
  mergeMapMetrics,
  readMapMetricsFromViewState,
  shouldFreezeViewportDataPipeline,
  shouldSkipLiveViewportWorkOnMove,
  viewStateMateriallyChanged,
} from './siMapInteractionPerf'

describe('siMapInteractionPerf', () => {
  it('freezes viewport pipeline for isolated dashboard embed', () => {
    expect(shouldFreezeViewportDataPipeline(true)).toBe(true)
    expect(shouldFreezeViewportDataPipeline(false)).toBe(false)
  })

  it('skips live viewport work on move when pipeline is frozen', () => {
    expect(shouldSkipLiveViewportWorkOnMove(true)).toBe(true)
    expect(shouldSkipLiveViewportWorkOnMove(false)).toBe(false)
  })

  it('merges map metrics only when zoom or latitude shifts materially', () => {
    const base = readMapMetricsFromViewState({ latitude: 24, zoom: 6 })
    expect(mergeMapMetrics(base, { latitude: 24.1, zoom: 6.02 })).toBe(base)
    expect(mergeMapMetrics(base, { latitude: 25, zoom: 6 })).toEqual({ latitude: 25, zoom: 6 })
    expect(mapMetricsChangedEnough(base, { latitude: 24, zoom: 7 })).toBe(true)
  })

  it('skips viewState commits on pan-only moveEnd', () => {
    const prev = { latitude: 10, longitude: 20, zoom: 8, pitch: 0, bearing: 0 }
    const panOnly = { latitude: 11, longitude: 21, zoom: 8.02, pitch: 0, bearing: 0.5 }
    expect(viewStateMateriallyChanged(prev, panOnly)).toBe(false)
    expect(viewStateMateriallyChanged(prev, { ...panOnly, zoom: 9 })).toBe(true)
    expect(viewStateMateriallyChanged(prev, { ...panOnly, pitch: 5 })).toBe(true)
  })

  it('formats bbox cache keys from tuple coordinates', () => {
    expect(bboxRefKey([1.23456, 2.34567, 3.45678, 4.56789])).toBe('1.235:2.346:3.457:4.568')
  })

  it('frame throttle runs at most once per frame burst', () => {
    let count = 0
    const throttle = createFrameThrottle()
    throttle(() => {
      count += 1
    })
    throttle(() => {
      count += 1
    })
    expect(count).toBe(0)
  })
})
