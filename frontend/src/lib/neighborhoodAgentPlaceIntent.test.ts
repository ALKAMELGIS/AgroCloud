import { describe, expect, it } from 'vitest'
import {
  formatNeighborhoodAgentFlyReply,
  formatNeighborhoodAgentPlaceNotFound,
  parseNeighborhoodAgentPlaceIntent,
  sanitizeNeighborhoodAgentReplyText,
} from './neighborhoodAgentPlaceIntent'

describe('parseNeighborhoodAgentPlaceIntent', () => {
  it('extracts place from show/fly/go/where intents', () => {
    expect(parseNeighborhoodAgentPlaceIntent('Show me Dubai')?.query).toBe('Dubai')
    expect(parseNeighborhoodAgentPlaceIntent('fly to Riyadh')?.query).toBe('Riyadh')
    expect(parseNeighborhoodAgentPlaceIntent('take me to Cairo')?.query).toBe('Cairo')
    expect(parseNeighborhoodAgentPlaceIntent('go to Paris, France')?.query).toBe('Paris, France')
    expect(parseNeighborhoodAgentPlaceIntent('locate Burj Khalifa')?.query).toBe('Burj Khalifa')
    expect(parseNeighborhoodAgentPlaceIntent('where is Jeddah')?.query).toBe('Jeddah')
    expect(parseNeighborhoodAgentPlaceIntent('zoom to Abu Dhabi')?.query).toBe('Abu Dhabi')
  })

  it('extracts Arabic navigate intents', () => {
    expect(parseNeighborhoodAgentPlaceIntent('اعرض دبي')?.query).toBe('دبي')
    expect(parseNeighborhoodAgentPlaceIntent('اذهب إلى الرياض')?.query).toBe('الرياض')
    expect(parseNeighborhoodAgentPlaceIntent('وين جدة')?.query).toBe('جدة')
  })

  it('accepts short bare place names', () => {
    expect(parseNeighborhoodAgentPlaceIntent('Dubai')?.query).toBe('Dubai')
    expect(parseNeighborhoodAgentPlaceIntent('دبي')?.query).toBe('دبي')
  })

  it('rejects analysis / non-navigate messages', () => {
    expect(parseNeighborhoodAgentPlaceIntent('analyze NDVI for my AOI')).toBeNull()
    expect(parseNeighborhoodAgentPlaceIntent('how many buildings are there')).toBeNull()
    expect(parseNeighborhoodAgentPlaceIntent('weather summary for neighborhood')).toBeNull()
    expect(parseNeighborhoodAgentPlaceIntent('Number of Popualtions in Dubai')).toBeNull()
    expect(parseNeighborhoodAgentPlaceIntent('number of population in Dubai')).toBeNull()
    expect(parseNeighborhoodAgentPlaceIntent('')).toBeNull()
  })

  it('rejects thematic / create / map phrases (no geocode)', () => {
    expect(parseNeighborhoodAgentPlaceIntent('Create Thematic maps')).toBeNull()
    expect(parseNeighborhoodAgentPlaceIntent('Themtic map')).toBeNull()
    expect(parseNeighborhoodAgentPlaceIntent('in map by Themtic map')).toBeNull()
    expect(parseNeighborhoodAgentPlaceIntent('create a thematic map of yield on Fields')).toBeNull()
    expect(parseNeighborhoodAgentPlaceIntent('style Fields by yield')).toBeNull()
    expect(parseNeighborhoodAgentPlaceIntent('choropleth of NDVI')).toBeNull()
    expect(parseNeighborhoodAgentPlaceIntent('show me a heatmap')).toBeNull()
  })
})

describe('formatNeighborhoodAgentFlyReply', () => {
  it('formats a one-line English confirmation', () => {
    expect(
      formatNeighborhoodAgentFlyReply({
        label: 'Dubai',
        subtitle: 'United Arab Emirates',
        lng: 55.2708,
        lat: 25.2048,
      }),
    ).toBe('Flew to Dubai, United Arab Emirates — 25.2048, 55.2708')
  })

  it('formats Arabic not-found', () => {
    expect(formatNeighborhoodAgentPlaceNotFound('Nowhere', 'ar')).toContain('Nowhere')
  })
})

describe('sanitizeNeighborhoodAgentReplyText', () => {
  it('strips iframe / Google Maps HTML embeds', () => {
    const raw =
      'Here is Dubai:\n<iframe src="https://www.google.com/maps/embed?pb=xxx"></iframe>\nMore text'
    const out = sanitizeNeighborhoodAgentReplyText(raw)
    expect(out).not.toMatch(/iframe/i)
    expect(out).not.toMatch(/google\.com\/maps/i)
    expect(out).toContain('Here is Dubai')
    expect(out).toContain('More text')
  })

  it('strips script/style and caps length', () => {
    const out = sanitizeNeighborhoodAgentReplyText(
      '<script>alert(1)</script><style>.x{}</style>' + 'x'.repeat(2000),
    )
    expect(out).not.toMatch(/script|style/i)
    expect(out.length).toBeLessThanOrEqual(1201)
    expect(out.endsWith('…')).toBe(true)
  })
})
