import { describe, expect, it } from 'vitest'
import {
  IMAGERY_TS_PREVIEW_DAYS,
  planImageryDateChunks,
} from './fetchImageryTimeSeriesProgressive'

describe('planImageryDateChunks', () => {
  it('leads with a short preview window for fast first paint', () => {
    const chunks = planImageryDateChunks('2024-01-01', '2025-07-08', 28, IMAGERY_TS_PREVIEW_DAYS)
    expect(chunks[0]).toEqual({ fromIso: '2025-06-25', toIso: '2025-07-08' })
    expect(chunks.length).toBeGreaterThan(1)
  })

  it('returns a single chunk for short ranges', () => {
    expect(planImageryDateChunks('2025-07-01', '2025-07-08')).toEqual([
      { fromIso: '2025-07-01', toIso: '2025-07-08' },
    ])
  })

  it('covers a multi-year Start date with older chunks after the preview', () => {
    const chunks = planImageryDateChunks('2021-01-01', '2026-07-21', 56, IMAGERY_TS_PREVIEW_DAYS)
    expect(chunks[0]?.toIso).toBe('2026-07-21')
    expect(chunks[chunks.length - 1]?.fromIso).toBe('2021-01-01')
    expect(chunks.length).toBeGreaterThan(10)
  })
})
