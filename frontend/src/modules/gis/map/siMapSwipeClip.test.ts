import { describe, expect, it } from 'vitest'
import { batchContainsSwipeAfter, splitDrapedBatchesBySwipe } from './siMapSwipeClip'

describe('splitDrapedBatchesBySwipe', () => {
  it('keeps a before-only batch intact', () => {
    const ids = ['si-swipe-before-lyr-0', 'hillshade']
    const out = splitDrapedBatchesBySwipe([{ start: 0, end: 1 }], i => ids[i])
    expect(out).toEqual([{ start: 0, end: 1 }])
    expect(batchContainsSwipeAfter(out[0]!, i => ids[i])).toBe(false)
  })

  it('splits a draped batch so After can be clipped on the same camera', () => {
    const ids = ['si-swipe-before-lyr-0', 'si-swipe-before-lyr-1', 'si-swipe-after-lyr-0', 'si-swipe-after-lyr-1']
    const out = splitDrapedBatchesBySwipe([{ start: 0, end: 3 }], i => ids[i])
    expect(out).toEqual([
      { start: 0, end: 1 },
      { start: 2, end: 3 },
    ])
    expect(batchContainsSwipeAfter(out[0]!, i => ids[i])).toBe(false)
    expect(batchContainsSwipeAfter(out[1]!, i => ids[i])).toBe(true)
  })
})
