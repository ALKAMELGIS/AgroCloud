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
})
