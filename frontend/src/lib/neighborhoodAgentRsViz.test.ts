import { describe, expect, it } from 'vitest'
import { formatRsLiftAsMarkdown, liftRsAnalysisFromText } from './neighborhoodAgentRsViz'

const SAMPLE = `Showing NDVI on the map for the current AOI (Remote Sensing overlay on).

Active analysis: NDVI
Scene / imagery date: 2026-07-25
Resolution: 10 m/px
Live per-class areas:
  - Water / No Vegetation · 0.0%
  - Very low vigor · 0.20 ha · 0.0%
  - High stress · 3.40 ha · 0.2%
  - Crop stress · 133.27 ha · 9.0%
  - Early watch · 904.64 ha · 61.2%
  - Watch · 220.25 ha · 14.9%
  - Moderate health · 89.14 ha · 6.0%
  - Good growth · 80.67 ha · 5.5%
  - Strong growth · 44.57 ha · 3.0%
  - Very Dense / Vigorous Vegetation · 1.36 ha · 0.1%`

describe('liftRsAnalysisFromText', () => {
  it('parses NDVI class areas into share + area tables', () => {
    const lift = liftRsAnalysisFromText(SAMPLE)
    expect(lift).not.toBeNull()
    expect(lift!.indexLabel).toMatch(/NDVI/i)
    expect(lift!.sceneDate).toBe('2026-07-25')
    expect(lift!.classes.length).toBeGreaterThanOrEqual(8)
    expect(lift!.shareTable?.rows.length).toBeGreaterThanOrEqual(8)
    expect(lift!.areaTable?.rows.some(r => String(r.values.class).includes('Early watch'))).toBe(true)
    expect(lift!.lead).toMatch(/Early watch/i)
  })

  it('round-trips through markdown format', () => {
    const lift = liftRsAnalysisFromText(SAMPLE)!
    const md = formatRsLiftAsMarkdown(lift)
    const again = liftRsAnalysisFromText(md)
    expect(again?.classes.length).toBe(lift.classes.length)
    expect(again?.shareTable?.rows.length).toBeGreaterThan(2)
  })

  it('returns null for unrelated text', () => {
    expect(liftRsAnalysisFromText('Show me Dubai')).toBeNull()
    expect(liftRsAnalysisFromText('')).toBeNull()
  })
})

describe('isAoiRsBreakdownFollowUpQuestion', () => {
  it('detects compare-last-breakdown follow-ups', async () => {
    const { isAoiRsBreakdownFollowUpQuestion } = await import('./neighborhoodAgentRsViz')
    expect(
      isAoiRsBreakdownFollowUpQuestion(
        'Compare the main categories from your last breakdown in a short table and highlight the dominant share.',
      ),
    ).toBe(true)
    expect(
      isAoiRsBreakdownFollowUpQuestion(
        'Compare the main NDVI / AOI index classes from the last remote-sensing breakdown in a short table and highlight the dominant share.',
      ),
    ).toBe(true)
    expect(isAoiRsBreakdownFollowUpQuestion('How many records on this layer?')).toBe(false)
    expect(isAoiRsBreakdownFollowUpQuestion('Show me Dubai')).toBe(false)
  })
})
