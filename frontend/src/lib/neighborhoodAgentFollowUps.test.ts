import { describe, expect, it } from 'vitest'
import { buildNeighborhoodAgentFollowUps } from './neighborhoodAgentFollowUps'

describe('buildNeighborhoodAgentFollowUps', () => {
  it('returns empty when there is no conversation context', () => {
    expect(buildNeighborhoodAgentFollowUps({})).toEqual([])
  })

  it('suggests contextual chips after a vegetation pack reply', () => {
    const chips = buildNeighborhoodAgentFollowUps({
      lastUserText: 'vegetation health',
      lastAssistantText: 'NDVI looks moderate across the AOI.',
      evidence: {
        packId: 'vegetation',
        packLabel: 'Vegetation / RS health',
        thoughtTitle: 'Thought · Vegetation',
        tools: [{ name: 'read_rs_analysis', label: 'RS analysis', ok: true, preview: 'NDVI' }],
      },
    })
    expect(chips.length).toBe(2)
    expect(chips.some(c => c.id === 'fu-veg')).toBe(false)
    expect(chips.some(c => /weather|flood|neighborhood|AOI/i.test(c.label))).toBe(true)
  })

  it('uses Arabic labels when the user wrote Arabic', () => {
    const chips = buildNeighborhoodAgentFollowUps({
      lastUserText: 'ما صحة الغطاء النباتي؟',
      lastAssistantText: 'المؤشر متوسط.',
      evidence: {
        packId: 'vegetation',
        thoughtTitle: 'Thought',
        tools: [{ name: 'read_rs_analysis', label: 'RS', ok: true, preview: 'ok' }],
      },
    })
    expect(chips).toHaveLength(2)
    expect(chips[0]?.label).toMatch(/[\u0600-\u06FF]/)
  })

  it('keeps only the two highest-priority suggestions', () => {
    const chips = buildNeighborhoodAgentFollowUps({
      lastUserText: 'what is the weather around here',
      lastAssistantText: 'Flew to Dubai.',
      evidence: {
        tools: [{ name: 'search_place' }],
      },
    })
    expect(chips).toHaveLength(2)
    // User asked about weather + around → those should outrank generic AOI
    expect(chips.map(c => c.id)).toEqual(expect.arrayContaining(['fu-weather', 'fu-map-focus']))
  })

  it('suggests compare/thematic after a stats-style answer', () => {
    const chips = buildNeighborhoodAgentFollowUps({
      lastUserText: 'population of Dubai',
      lastAssistantText: 'Total about 3.35 million. Indians share ~28%.',
      hasTableOrChartCue: true,
    })
    expect(chips).toHaveLength(2)
    expect(chips[0]?.id).toBe('fu-compare')
    expect(chips.some(c => c.id === 'fu-compare' || c.id === 'fu-thematic')).toBe(true)
  })
})